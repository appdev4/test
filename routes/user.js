var lib = require("../server/lib");
var database = require('../server/database');
var assert = require('better-assert');
var async = require('async');
var uuid = require('uuid');
var config = require('../config/config');
var bitcoinjs = require('bitcoinjs-lib');
var withdraw = require('../server/withdraw');
var sendEmail = require('../server/sendEmail');

var sessionOptions = {
	    httpOnly: true
	    //set secure here *************************
	};

exports.games = function(req, res){
 res.render('files/games', { title: 'Games.html - Select games',
		                     active_menu:'Games'
		                   });
};
	
exports.playgame = function(req, res){
  res.render('files/game', { title: 'Game.html - Play the game here',
	  						 active_menu:'Play'
	                       });
};

exports.login_register = function(req, res){
  res.render('files/login_register', { title: 'Register.html - register',
	  								   active_menu: 'loginRegister',
	                                   register: req.query.register
	                                 });
};

/*render account page */

exports.account = function(req, res){
  var userId = req.user.id;
  var user = req.user;
  var deposit_address = lib.deriveAddress(userId);

  assert(user);
  console.log(user);
  
  res.render('files/account', { title: 'Account.html - Account',
	                            deposit_address:deposit_address,
	                            active_menu:'Account',
	                            user:user
	                          });
};
  /*render deposits page*/	
exports.deposit = function(req, res){  
  var userId = req.user.id;
  var user = req.user;
  var deposit_address = lib.deriveAddress(userId);
  assert(user);
  res.render('files/deposit', { title: 'deposit.html - Deposit',
	  						    deposit_address:deposit_address,
	  						    active_menu:'Account',
	                            user:user
	                          });
};


/**
* GET
* Restricted API
* Shows the withdrawal history
**/

exports.withdraw = function(req, res){    
 var user = req.user;
 assert(user);
 
 database.getWithdrawals(user.id, function(err, withdrawals) {
     if (err)
         return next(new Error('Unable to get withdrawals: \n' + err));

     withdrawals.forEach(function(withdrawal) {
         withdrawal.shortDestination = withdrawal.destination.substring(0,8);
     });
     user.withdrawals = withdrawals;
   
     res.render('files/withdraw', { user: user,active_menu:'Account' });
 });
 
 };

 /**
  * GET
  * Restricted API
  * Shows the withdrawal request page
  **/
 exports.withdrawRequest = function(req, res) {
     assert(req.user);
     res.render('files/withdraw-request', { user: req.user, id: uuid.v4() ,active_menu:'Account' });
 };

 
/**
 * POST
 * Restricted API
 * Process a withdrawal
 **/
exports.handleWithdrawRequest = function(req, res, next) {
	    var user = req.user;
	    assert(user);

	    var amount = lib.removeNullsAndTrim(req.body.amount);
	    var destination = lib.removeNullsAndTrim(req.body.destination);
	    var withdrawalId = lib.removeNullsAndTrim(req.body.withdrawal_id);
	    var password = lib.removeNullsAndTrim(req.body.password);
	    var otp = lib.removeNullsAndTrim(req.body.otp);

	    var r =  /^[1-9]\d*(\.\d{0,2})?$/;
	    if (!r.test(amount))
	        return res.render('files/withdraw-request', { user: user, id: uuid.v4(),  warning: 'Not a valid amount' , active_menu:'Account' });

	    amount = Math.round(parseFloat(amount) * 100);
	    assert(Number.isFinite(amount));

	    var minWithdraw = config.MINING_FEE + 10000;

	    if (amount < minWithdraw)
	        return res.render('files/withdraw-request', { user: user,  id: uuid.v4(), warning: 'You must withdraw ' + minWithdraw + ' or more' , active_menu:'Account' });

	    if (typeof destination !== 'string')
	        return res.render('files/withdraw-request', { user: user,  id: uuid.v4(), warning: 'Destination address not provided' , active_menu:'Account'});

	    try {
	        var version = bitcoinjs.address.fromBase58Check(destination).version;
	        if (version !== bitcoinjs.networks.bitcoin.pubKeyHash && version !== bitcoinjs.networks.bitcoin.scriptHash)
	            return res.render('files/withdraw-request', { user: user,  id: uuid.v4(), warning: 'Destination address is not a bitcoin one'  , active_menu:'Account'});
	    } catch(ex) {
	        return res.render('files/withdraw-request', { user: user,  id: uuid.v4(), warning: 'Not a valid destination address' , active_menu:'Account'});
	    }

	    if (!password)
	        return res.render('files/withdraw-request', { user: user,  id: uuid.v4(), warning: 'Must enter a password'  , active_menu:'Account'});

	    if(!lib.isUUIDv4(withdrawalId))
	      return res.render('files/withdraw-request', { user: user,  id: uuid.v4(), warning: 'Could not find a one-time token' , active_menu:'Account' });

	    database.validateUser(user.username, password, otp, function(err) {

	        if (err) {
	            if (err === 'WRONG_PASSWORD')
	                return res.render('files/withdraw-request', { user: user, id: uuid.v4(), warning: 'wrong password, try it again...' , active_menu:'Account'});
	            if (err === 'INVALID_OTP')
	                return res.render('files/withdraw-request', { user: user, id: uuid.v4(), warning: 'invalid one-time token' , active_menu:'Account'});
	            //Should be an user
	            return next(new Error('Unable to validate user handling withdrawal: \n' + err));
	        }

	        withdraw(req.user.id, amount, destination, withdrawalId, function(err) {
	            if (err) {
	                if (err === 'NOT_ENOUGH_MONEY')
	                    return res.render('files/withdraw-request', { user: user, id: uuid.v4(), warning: 'Not enough money to process withdraw.' , active_menu:'Account'});
	                else if (err === 'PENDING')
	                    return res.render('files/withdraw-request', { user: user,  id: uuid.v4(), success: 'Withdrawal successful, however hot wallet was empty. Withdrawal will be reviewed and sent ASAP' , active_menu:'Account'});
	                else if(err === 'SAME_WITHDRAWAL_ID')
	                    return res.render('files/withdraw-request', { user: user,  id: uuid.v4(), warning: 'Please reload your page, it looks like you tried to make the same transaction twice.' , active_menu:'Account'});
	                else if(err === 'FUNDING_QUEUED')
	                    return res.render('files/withdraw-request', { user: user,  id: uuid.v4(), success: 'Your transaction is being processed come back later to see the status.' , active_menu:'Account' });
	                else
	                    return next(new Error('Unable to withdraw: ' + err));
	            }
	            return res.render('files/withdraw-request', { user: user, id: uuid.v4(), success: 'OK' , active_menu:'Account'});
	        });
	    });
};

/**
 * POST
 * Restricted API
 * Process a password reset request
 **/
exports.handleRecoverPasswordRequest = function(req, res, next) {
	
  var warning = "none";
  var success = "true";
  var user = req.user;
  assert(user);
  res.render('files/recover', { title: 'recover.html - witdraw ok',
                                active_menu:'Account',
	                            Email:req.body.email,
	                            warning:warning,
	                            success:success,
	                            user:user
                               });      	
};

/**
 * POST
 * Public API
 * handle a user registration request
 **/
exports.RegisterUser = function(req, res, next) {
 var username = lib.removeNullsAndTrim(req.body.username);
 var password = lib.removeNullsAndTrim(req.body.password);
 var password2 = lib.removeNullsAndTrim(req.body.confirmpassword);
 var email = lib.removeNullsAndTrim(req.body.email);
 var ipAddress = req.ip;
 var userAgent = req.get('user-agent');
 
 //Check if the user name is valid
 var notValid = lib.isInvalidUsername(username);
 if (notValid) 
	 return res.render('files/login_register', { warning: 'Username not valid because: ' + notValid,
												 register:'true',
										         username:username,
										         email:email});
 //Check if password is valid
     notValid = lib.isInvalidPassword(password);
 if (notValid) {
     return res.render('files/login_register', { warning: 'Password not valid because: ' + notValid,
										    	 title: 'Register.html - Registration Error',
										         register:'true',
										         username:username,
										         email:email});
 }
 
 //check if email is valid
 if (email) {
     notValid = lib.isInvalidEmail(email);
     if (notValid) return res.render('files/login_register', { warning: 'Email not valid because: ' + notValid,
										    	 title: 'Register.html - Registration Error',
										         register:'true',
										         username:username,
										         email:email});
 }

 //Ensure password and confirmation match
 if(password !== password2) {
     return res.render('files/login_register', {
    	                                        title: 'Register.html - Registration Error',
                                                warning: 'Passwords did not match',
                                                register:'true',
                                                username:username,
                                                email:email
                                               });
 }
 
 database.createUser(username, password, email, ipAddress, userAgent, function(err, sessionId) {
     if (err) {
         if (err === 'USERNAME_TAKEN') {
            // values.user.name = null;
            return res.render('files/login_register', { warning: 'User name already taken...',
            											register:'true'});
         }
         return next(new Error('Unable to register user: \n' + err));
     }
     res.cookie('id', sessionId, sessionOptions);
     return res.redirect('/play?m=new');
 });	
};

/**
 * POST
 * Restricted API
 * Handle login request
 **/
exports.UserLogin = function(req, res, next) {
 var username = lib.removeNullsAndTrim(req.body.username);
 var password = lib.removeNullsAndTrim(req.body.password);
 var otp = lib.removeNullsAndTrim(req.body.otp);
 var remember = !!req.body.remember;
 var ipAddress = req.ip;
 var userAgent = req.get('user-agent');
 
 
 database.validateUser(username, password, otp, function(err, userId) {
     if (err) {
         console.log('[Login] Error for ', username, ' err: ', err);

         if (err === 'NO_USER')
             return res.render('files/login_register',{ warning: 'Username does not exist' });
         if (err === 'WRONG_PASSWORD')
             return res.render('files/login_register', { warning: 'Invalid password' });
         if (err === 'INVALID_OTP') {
             var warning = otp ? 'Invalid one-time password' : undefined;
             return res.render('files/login-mfa', { username: username, password: password, warning: warning });
         }
         return next(new Error('Unable to validate user ' + username + ': \n' + err));
     }
     assert(userId);
     
     database.createSession(userId, ipAddress, userAgent, remember, function(err, sessionId, expires) {
         if (err)
             return next(new Error('Unable to create session for userid ' + userId +  ':\n' + err));

         if(remember)
             sessionOptions.expires = expires;

         res.cookie('id', sessionId, sessionOptions);
         res.redirect('/Account');
     });
 });
};



/**
 * POST
 * Logged API
 * Logout the current user
 */
exports.logout = function(req, res, next) {
    var sessionId = req.cookies.id;
    var userId = req.user.id;

    assert(sessionId && userId);

    database.expireSessionsByUserId(userId, function(err) {
        if (err)
            return next(new Error('Unable to logout got error: \n' + err));
        res.redirect('/');
    });
};



/**
 * POST
 * Public API
 * Send password recovery to an user if possible
 **/
exports.sendPasswordRecover = function(req, res, next) {
    var email = lib.removeNullsAndTrim(req.body.email);
    if (!email) return res.redirect('forgot-password');
    var remoteIpAddress = req.ip;

    //We don't want to leak if the email has users, so we send this message even if there are no users from that email
    var messageSent = { success: 'We\'ve sent an email to you if there is a recovery email.' };

    database.getUsersFromEmail(email, function(err, users) {
        if(err) {
            if(err === 'NO_USERS')
                return res.render('files/login-register', messageSent);
            else
                return next(new Error('Unable to get users by email ' + email +  ': \n' + err));
        }

        var recoveryList = []; //An array of pairs [username, recoveryId]
        async.each(users, function(user, callback) {

            database.addRecoverId(user.id, remoteIpAddress, function(err, recoveryId) {
                if(err)
                    return callback(err);

                recoveryList.push([user.username, recoveryId]);
                callback(); //async success
            })

        }, function(err) {
            if(err)
                return next(new Error('Unable to add recovery id :\n' + err));

            sendEmail.passwordReset(email, recoveryList, function(err) {
                if(err)
                    return next(new Error('Unable to send password email: \n' + err));

                return res.render('files/login-register',  messageSent);
            });
        });

    });
};

/**
 * GET
 * Public API
 * Validate if the reset id is valid or is has not being uses, does not alters the recovery state
 * Renders the change password
 **/
exports.validateResetPassword = function(req, res, next) {
    var recoverId = req.params.recoverId;
    if (!recoverId || !lib.isUUIDv4(recoverId))
        return next('Invalid recovery id');

    database.getUserByValidRecoverId(recoverId, function(err, user) {
        if (err) {
            if (err === 'NOT_VALID_RECOVER_ID')
                return next('Invalid recovery id');
            return next(new Error('Unable to get user by recover id ' + recoverId + '\n' + err));
        }
        res.render('reset-password', { user: user, recoverId: recoverId });
    });
};

/**
 * POST
 * Public API
 * Receives the new password for the recovery and change it
 **/
exports.resetPasswordRecovery = function(req, res, next) {
    var recoverId = req.body.recover_id;
    var password = lib.removeNullsAndTrim(req.body.password);
    var ipAddress = req.ip;
    var userAgent = req.get('user-agent');

    if (!recoverId || !lib.isUUIDv4(recoverId)) return next('Invalid recovery id');

    var notValid = lib.isInvalidPassword(password);
    if (notValid) return res.render('reset-password', { recoverId: recoverId, warning: 'password not valid because: ' + notValid });

    database.changePasswordFromRecoverId(recoverId, password, function(err, user) {
        if (err) {
            if (err === 'NOT_VALID_RECOVER_ID')
                return next('Invalid recovery id');
            return next(new Error('Unable to change password for recoverId ' + recoverId + ', password: ' + password + '\n' + err));
        }
        database.createSession(user.id, ipAddress, userAgent, false, function(err, sessionId) {
            if (err)
                return next(new Error('Unable to create session for password from recover id: \n' + err));

            res.cookie('id', sessionId, sessionOptions);
            res.redirect('/');
        });
    });
};



