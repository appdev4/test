
/**
 * Module dependencies.
 */

var express = require('express')
  , user = require('./routes/user')
  , routes = require('./server/routes')
  , http = require('http')
  , path = require('path');

var Chat = require('./server/chat');
var database = require('./server/database');
var lib = require('./server/lib');
var config = require('./config/config');

var app = express();

//app.locals.recaptchaKey = config.RECAPTCHA_SITE_KEY;
//app.locals.buildConfig = config.BUILD;
app.locals.miningFeeBits = config.MINING_FEE/100;

//configuration
app.use(express.cookieParser());
//test
app.use(function(req, res, next) {
	
    var sessionId = req.cookies.id;

    console.log("okay here" + sessionId );
    
    if (!sessionId) {
        res.header('Vary', 'Accept, Accept-Encoding, Cookie');
        res.header('Cache-Control', 'public, max-age=60'); // Cache the logged-out version
        return next();
    }

    res.header('Cache-Control', 'no-cache');
    res.header("Content-Security-Policy", "frame-ancestors 'none'");


    if (!lib.isUUIDv4(sessionId)) {
        res.clearCookie('id');
        return next();
    }

    database.getUserBySessionId(sessionId, function(err, user) {
        if (err) {
            res.clearCookie('id');
            if (err === 'NOT_VALID_SESSION') {
                return res.redirect('/');
            } else {
                console.error('[INTERNAL_ERROR] Unable to get user by session id ' + sessionId + ':', err);
                return res.redirect('/error');
            }
        }
        user.advice = req.query.m;
        user.error = req.query.err;
  //      user.eligible = lib.isEligibleForGiveAway(user.last_giveaway);
        user.active_menu = req.active_menu;
 
        user.admin = user.userclass === 'admin';
        user.moderator = user.userclass === 'admin' ||
                         user.userclass === 'moderator';
        req.user = user;
        
        user.password = '';
        user.mfa_secret = '';
        user.email = '';
       
        next();
    });

});


/** Error Middleware
*
* How to handle the errors:
* If the error is a string: Send it to the client.
* If the error is an actual: error print it to the server log.
*
* We do not use next() to avoid sending error logs to the client
* so this should be the last middleware in express .
*/
function errorHandler(err, req, res, next) {

   if (err) {
       if(typeof err === 'string') {
           return res.render('error', { error: err });
       } else {
           if (err.stack) {
               console.error('[INTERNAL_ERROR] ', err.stack);
           } else console.error('[INTERNAL_ERROR', err);

           res.render('error');
       }

   } else {
       console.warning("A 'next()' call was made without arguments, if this an error or a msg to the client?");
   }

}


//all environments
app.set('port', process.env.PORT || 3017);
app.set('views', __dirname + '/views');
app.set('view engine', 'ejs');
app.use(express.favicon());
app.use(express.logger('dev'));
app.use(express.bodyParser());
app.use(express.methodOverride());
app.use(app.router);

app.use(express.static(path.join(__dirname, 'public')));

routes(app);
app.use(errorHandler);



var server = http.createServer(app).listen(app.get('port'), function(){
  console.log('Express server listening on port ' + app.get('port'));
});

var io = require('socket.io').listen(server); 

var chatServer = new Chat(io);

