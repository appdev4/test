/*
** Broadcast a message to connected users when someone connects or disconnects -
Add support for nicknames
Don’t send the same message to the user that sent it himself. Instead, append the message directly as soon as he presses enter.
Add “{user} is typing” functionality
Show who’s online
Add private messaging
Share your improvements!
*/

function Chat(io) {
      
  //Create an array to hold user names - uuid 
  var connectedPlayers = new Array();
  var UserCount = 0;
  io.on('connection', function(client){
  	UserCount++;
  io.emit('user connected', UserCount);    
  	
  //A user dissconnected --- which user?
  client.on('disconnect', function(){
	    UserCount--;
	    console.log('user disconnected');
	    io.emit('user disconnected', UserCount); //broadcast that user disconnected
	    
	  });
  	  
  //server received a chat message from a client, process and update broadcast chat message to other clients
  client.on('chat message', function(msg){
  	    if(msg.length > 0)
	    io.emit('chat message', msg); 
	  });
  	  
  });

}

module.exports = Chat;