var pg = require('pg');
var uuid = require('uuid');
var assert = require('assert');
var passwordHash = require('password-hash');
var lib = require("../server/lib");
var databaseUrl = "postgres://testuser:testuser@localhost:5432/testdatabase";


if (!databaseUrl)
    throw new Error('must set DATABASE_URL environment var');

console.log('DATABASE_URL: ', databaseUrl);

pg.types.setTypeParser(20, function(val) { // parse int8 as an integer
    return val === null ? null : parseInt(val);
});

// callback is called with (err, client, done)
function connect(callback) {
    return pg.connect(databaseUrl, callback);
}

function query(query, params, callback) {
    //third parameter is optional
    if (typeof params == 'function') {
        callback = params;
        params = [];
    }

    doIt();
    function doIt() {
        connect(function(err, client, done) {
            if (err) return callback(err);
            client.query(query, params, function(err, result) {
                done();
                if (err) {
                    if (err.code === '40P01') {
                        console.error('[INTERNAL] Warning: Retrying deadlocked transaction: ', query, params);
                        return doIt();
                    }
                    return callback(err);
                }

                callback(null, result);
            });
        });
    }
}

exports.query = query;

pg.on('error', function(err) {
    console.error('POSTGRES EMITTED AN ERROR', err);
});


// runner takes (client, callback)

// callback should be called with (err, data)
// client should not be used to commit, rollback or start a new transaction

// callback takes (err, data)

function getClient(runner, callback) {
    doIt();

    function doIt() {
        connect(function (err, client, done) {
            if (err) return callback(err);

            function rollback(err) {
                client.query('ROLLBACK', done);

                if (err.code === '40P01') {
                    console.error('[INTERNAL_ERROR] Warning: Retrying deadlocked transaction..');
                    return doIt();
                }

                callback(err);
            }

            client.query('BEGIN', function (err) {
                if (err)
                    return rollback(err);

                runner(client, function (err, data) {
                    if (err)
                        return rollback(err);

                    client.query('COMMIT', function (err) {
                        if (err)
                            return rollback(err);

                        done();
                        callback(null, data);
                    });
                });
            });
        });
    }
}


//Returns a sessionId
exports.createUser = function(username, password, email, ipAddress, userAgent, callback) {
  assert(username && password);

  getClient(
      function(client, callback) {
          var hashedPassword = passwordHash.generate(password);

          client.query('SELECT COUNT(*) count FROM users WHERE lower(username) = lower($1)', [username],
              function(err, data) {
                  if (err) return callback(err);
                  assert(data.rows.length === 1);
                  if (data.rows[0].count > 0)
                      return callback('USERNAME_TAKEN');

                  client.query('INSERT INTO users(username, email, password) VALUES($1, $2, $3) RETURNING id',
                          [username, email, hashedPassword],
                          function(err, data) {
                              if (err)  {
                                  if (err.code === '23505')
                                      return callback('USERNAME_TAKEN');
                                  else
                                      return callback(err);
                              }

                              assert(data.rows.length === 1);
                              var user = data.rows[0];

                              createSession(client, user.id, ipAddress, userAgent, false, callback);
                          }
                      );

                  });
      }
  , callback);
};


exports.getUserBySessionId = function(sessionId, callback) {
    assert(sessionId && callback);
    query('SELECT * FROM users_view WHERE id = (SELECT user_id FROM sessions WHERE id = $1 AND ott = false AND expired > now())', [sessionId], function(err, response) {
        if (err) return callback(err);

        var data = response.rows;
        if (data.length === 0)
            return callback('NOT_VALID_SESSION');

        assert(data.length === 1);

        var user = data[0];
        assert(typeof user.balance_satoshis === 'number');

        callback(null, user);
    });
};


function createSession(client, userId, ipAddress, userAgent, remember, callback) {
    var sessionId = uuid.v4();

    var expired = new Date();
    if (remember)
        expired.setFullYear(expired.getFullYear() + 10);
    else
        expired.setDate(expired.getDate() + 21);

    client.query('INSERT INTO sessions(id, user_id, ip_address, user_agent, expired) VALUES($1, $2, $3, $4, $5) RETURNING id',
        [sessionId, userId, ipAddress, userAgent, expired], function(err, res) {
        if (err) return callback(err);
        assert(res.rows.length === 1);

        var session = res.rows[0];
        assert(session.id);

        callback(null, session.id, expired);
    });
}

exports.createSession = function(userId, ipAddress, userAgent, remember, callback) {
    assert(userId && callback);

    getClient(function(client, callback) {
        createSession(client, userId, ipAddress, userAgent, remember, callback);
    }, callback);

};


//Possible errors:
//NO_USER, WRONG_PASSWORD, INVALID_OTP
exports.validateUser = function(username, password, otp, callback) {
assert(username && password);

query('SELECT id, password, mfa_secret FROM users WHERE lower(username) = lower($1)', [username], function (err, data) {
   if (err) return callback(err);

   if (data.rows.length === 0)
       return callback('NO_USER');

   var user = data.rows[0];

   var verified = passwordHash.verify(password, user.password);
   if (!verified)
       return callback('WRONG_PASSWORD');

   if (user.mfa_secret) {
       if (!otp) return callback('INVALID_OTP'); // really, just needs one

       var expected = speakeasy.totp({ key: user.mfa_secret, encoding: 'base32' });

       if (otp !== expected)
           return callback('INVALID_OTP');
   }

   callback(null, user.id);
});
};

/** Expire all the not expired sessions of an user by id **/
exports.expireSessionsByUserId = function(userId, callback) {
assert(userId);

query('UPDATE sessions SET expired = now() WHERE user_id = $1 AND expired > now()', [userId], callback);
};


exports.makeWithdrawal = function(userId, satoshis, withdrawalAddress, withdrawalId, callback) {
    assert(typeof userId === 'number');
    assert(typeof satoshis === 'number');
    assert(typeof withdrawalAddress === 'string');
    assert(satoshis > 10000);
    assert(lib.isUUIDv4(withdrawalId));

    getClient(function(client, callback) {

        client.query("UPDATE users SET balance_satoshis = balance_satoshis - $1 WHERE id = $2",
            [satoshis, userId], function(err, response) {
            if (err) return callback(err);

            if (response.rowCount !== 1)
                return callback(new Error('Unexpected withdrawal row count: \n' + response));

            client.query('INSERT INTO fundings(user_id, amount, bitcoin_withdrawal_address, withdrawal_id) ' +
                "VALUES($1, $2, $3, $4) RETURNING id",
                [userId, -1 * satoshis, withdrawalAddress, withdrawalId],
                function(err, response) {
                    if (err) return callback(err);

                    var fundingId = response.rows[0].id;
                    assert(typeof fundingId === 'number');

                    callback(null, fundingId);
                }
            );
        });

    }, callback);
};

exports.getWithdrawals = function(userId, callback) {
    assert(userId && callback);

    query("SELECT * FROM fundings WHERE user_id = $1 AND amount < 0 ORDER BY created DESC", [userId], function(err, result) {
        if (err) return callback(err);

        var data = result.rows.map(function(row) {
           return {
               amount: Math.abs(row.amount),
               destination: row.bitcoin_withdrawal_address,
               status: row.bitcoin_withdrawal_txid,
               created: row.created
           };
        });
        callback(null, data);
    });
};

exports.getUsersFromEmail = function(email, callback) {
    assert(email, callback);

    query('select * from users where email = lower($1)', [email], function(err, data) {
       if (err) return callback(err);

        if (data.rows.length === 0)
            return callback('NO_USERS');

        callback(null, data.rows);

    });
};



exports.addRecoverId = function(userId, ipAddress, callback) {
    assert(userId && ipAddress && callback);

    var recoveryId = uuid.v4();

    query('INSERT INTO recovery (id, user_id, ip)  values($1, $2, $3)', [recoveryId, userId, ipAddress], function(err, res) {
        if (err) return callback(err);
        callback(null, recoveryId);
    });
};

