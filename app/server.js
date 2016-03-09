// --------------------------------------------------------------
//  modules
// --------------------------------------------------------------
var _ = require('underscore')
,express = require('express')
,http = require('http')
,https = require('https')
,winston = require('./winston')
,fs = require('fs')
,path = require('path')
,vhost = require('./vhost.js')
//,exec = require('child_process').exec
//,async = require('async')
//,pkg = require(process.cwd()+'/package.json')
//,gulp = require('./gulp.js')
//,flush = require('./flush.js')
//,require('./backend-helpers.js')
;


// --------------------------------------------------------------
//  configs
// --------------------------------------------------------------
var config = require('../config.js')
,routesConfig = require(process.cwd()+'/config/routes.json')
;


// --------------------------------------------------------------
//  app config
// --------------------------------------------------------------
var app = express();
app.configure(function(){
	app.set('port', process.env.PORT || +config.http.port || 3000);
	app.set('app root', process.cwd());
	app.set('path', process.cwd() + '/app');
	app.set('public', process.cwd() + '/public');
	app.set('views', path.join(process.cwd(),'views'));
	app.set('routesConfig', routesConfig);
	app.set('config', config);
});


// --------------------------------------------------------------
//  custom routes
// --------------------------------------------------------------
app.get('/hc', function(req, res, next){
  res.setHeader('Connection','close'); // disable keep-alive
  res.send('OK');
});
// Healthcheck should should not respond while shutting down app
process.on('SIGINT', function(){
	app.routes.get.filter(function(route){
		return route.path != '/hc';
	});
});

app.get('/id', function(req, res, next){
	app.disable ('etag'); // disable caching by cdn like cloudfront
	var config = req.app.get('config');
	res.send({
		commit: app.get('git-hash') || null
		,tag: app.get('git-tag') || null
		,branch: app.get('git-branch') || null
		,api: config.get('api.endpoint') || null
		,dependencies: pkg.dependencies || null
	});
});


// --------------------------------------------------------------
//  attach virtual hosts
// --------------------------------------------------------------
// for now just the one
vhost.create(app, 'fsb', {});
/*
_.each(config.vhosts,function(vhostOpts,key){
	vhost.create(app, key, vhostOpts);
});
*/



// --------------------------------------------------------------
//   Start handling requests
// --------------------------------------------------------------
app.on('initialized', function(){
	var config = app.get('config');

	// Utility function to take a type of server (http or https), and boot it up
	// with a provided config (should include port, and optionally SSL cert and key)
	function boot(type, settings){
		if (type == 'https') {
			if (settings.key && settings.cert) {
				try {
					settings.key = fs.readFileSync(settings.key, 'utf8');
					settings.cert = fs.readFileSync(settings.cert, 'utf8');
				} catch (e) {
					throw new Error('Cannot retrieve HTTP credentials from disk');
				}
			} else {
				throw new Error('HTTPS server requested but no key or cert was specified');
			}
		}

		if (type == 'http') {
			var server = http.createServer(app);
		} else if type == 'https') {
			var server = https.createServer(settings, app);
		} else {
			throw new Error('Invalid protocol type');
		}

		// Wire up our server to its port
		if (!settings.address) {
			settings.address = '0.0.0.0';
		}
		server.listen(settings.port,settings.address,function(){
			if (app.get('env') != 'test') {
				winston.info(app.get('env')+' server listening on address '+settings.address+' port '+settings.port);
			}
		});
		return server;
	});

	function configure(type){
		var settings = config.get(type);
		if (type == 'http') {
			settings.port = app.get('port');
		}
		if (app.get('env') == 'development') {
			process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
		}
		if (settings) boot(type,settings);
	}

	function exists(thing){
		return !!thing;
	}

	var servers = ['http', 'https'].map(configure).filter(exists);

	// Shutting down? Stop accepting new connections and hustle the old ones out
	process.on('SIGINT', function(){
		winston.info('Caught SIGINT, refusing incoming connections');

		// Shut down each server in turn, when all are shut down, exit the process
		var toKill = servers.length
			,killed = 0
		;
		servers.forEach(function(server){
			server.close(function(){
				if (++killed == toKill) {
					process.exit();
				}
			});
		});
	});

});


module.exports = app;


var cluster = require('cluster');
if (cluster.isWorker) {
	require('./repl')(cluster.worker.workerID);
} else {
	require('./repl')('');
}


