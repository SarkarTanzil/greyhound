var
    WebSocketServer = require('ws').Server,
    http = require('http'),
    express = require('express'),
    console = require('clim')(),

    disco = require('../common').disco,

    CommandHandler = require('./lib/command-handler').CommandHandler,

    numBytes = { }
    ;

(function() {
    'use strict';

    var WebsocketHandler = function(controller, port) {
        this.controller = controller;
        this.port = port;
    }

    WebsocketHandler.prototype.start = function() {
        var self = this;

        var app = express();
        app.use(function(req, res, next) {
            res.header('X-Powered-By', 'Hobu, Inc.');
            next();
        });

        app.get('/', function(req, res) {
            res.send('Hobu, Inc. point distribution server');
        });

        var server = http.createServer(app);
        disco.register("ws", self.port, function(err, service) {
            if (err) return console.log("Failed to start service:", err);

            self.port = service.port;

            server.listen(self.port);
            var wss = new WebSocketServer({ server: server });

            console.log('Websocket server running on port: ' + self.port);

            wss.on('connection', function(ws) {
                console.log("websocket::connection");
                var handler = new CommandHandler(ws);
                registerCommands(self.controller, handler, ws);
            });
        });
    }

    var stringifyParam = function(obj, paramName) {
        if (obj.hasOwnProperty(paramName)) {
            obj[paramName] = JSON.stringify(obj[paramName]);
        }
    }

    var registerCommands = function(controller, handler, ws) {
        handler.on('put', function(msg, cb) {
            controller.put(msg.pipeline, cb);
        });

        handler.on('create', function(msg, cb) {
            controller.create(msg.pipelineId, cb);
        });

        handler.on('numPoints', function(msg, cb) {
            controller.numPoints(msg.session, cb);
        });

        handler.on('schema', function(msg, cb) {
            controller.schema(msg.session, cb);
        });

        handler.on('stats', function(msg, cb) {
            controller.stats(msg.session, cb);
        });

        handler.on('srs', function(msg, cb) {
            controller.srs(msg.session, cb);
        });

        handler.on('fills', function(msg, cb) {
            controller.fills(msg.session, cb);
        });

        handler.on('serialize', function(msg, cb) {
            controller.serialize(msg.session, cb);
        });

        handler.on('destroy', function(msg, cb) {
            controller.destroy(msg.session, cb);
        });

        handler.on('cancel', function(msg, cb) {
            controller.cancel(msg.session, msg.readId, function(err, res) {
                if (res.cancelled) res['numBytes'] = numBytes[msg.readId];
                cb(null, res);
            });
        });

        handler.on('read', function(msg, cb) {
            var params = msg;

            var session = params.session;
            if (msg.hasOwnProperty('session')) delete params.session;
            var summary = params.summary;
            if (params.hasOwnProperty('summary')) delete params.summary;

            stringifyParam(params, 'schema');
            stringifyParam(params, 'resolution');
            stringifyParam(params, 'bbox');

            var readId;

            controller.read(
                session,
                params,
                function(err, res) {
                    if (!err) readId = res.readId;
                    numBytes[readId] = 0;
                    cb(err, res);
                },
                function(data) {
                    numBytes[readId] += data.length;
                    ws.send(data, { binary: true });
                },
                function() {
                    if (summary) {
                        ws.send(JSON.stringify({
                            'command':  'summary',
                            'status':   1,
                            'readId':   readId,
                            'numBytes': numBytes[readId]
                        }),
                        null,
                        function() {
                            delete numBytes[readId];
                        });
                    }
                    else {
                        delete numBytes[readId];
                    }
                }
            );
        });
    }

    module.exports.WebsocketHandler = WebsocketHandler;
})();

