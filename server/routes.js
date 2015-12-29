var lib = require("../server/lib");
var database = require('../server/database');
var assert = require('better-assert');
var user = require('../routes/user');

function staticPageLogged(page, loggedGoTo) {

    return function(req, res) {
        var user = req.user;
        if (!user){
            return res.render(page);
        }
        if (loggedGoTo) return res.redirect(loggedGoTo);

        res.render(page, {
            user: user,
            active_menu:'Home'
        });
    }
}


function restrict(req, res, next) {
    if (!req.user) {
       res.status(401);
       if (req.header('Accept') === 'text/plain')
          res.send('Not authorized');
       else
    	   console.log("here");
          res.render('401');
       return;
    } else
        next();
}

function restrictRedirectToHome(req, res, next) {
    if(!req.user) {
        res.redirect('/');
        return;
    }
    next();
}




module.exports = function(app) {


	//Routes to get handlers
	app.get('/', staticPageLogged('files/index'));
	//app.get('/',user.index);
	app.get('/play', user.playgame);
	app.get('/login_register',staticPageLogged('files/login_register'));
	app.get('/account',restrict,user.account);
	app.get('/deposit',restrict,user.deposit);
	app.get('/games',restrict,user.games);
	app.get('/withdraw',restrict,user.withdraw);
	app.get('/withdraw-request', restrict, user.withdrawRequest);
	
	//Routes to post handlers
	//app.post('/login', recaptchaRestrict, user.login);
	app.post('/login', user.UserLogin);
	app.post('/register', user.RegisterUser);
	app.post('/recover', user.handleRecoverPasswordRequest);
	app.post('/withdraw-request', restrict, user.handleWithdrawRequest);
    app.post('/logout', restrictRedirectToHome, user.logout);
   
    //app.post('/request', restrict, user.giveawayRequest); //set recapture
    app.post('/sent-reset', user.resetPasswordRecovery);
    app.post('/sent-recover', user.sendPasswordRecover);  //set recapture recaptchaRestrict
  //  app.post('/reset-password', restrict, user.resetPassword);

};
