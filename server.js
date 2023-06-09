
var express = require('express');
var app = express();
var server = require('http').createServer(app);
var mongoose = require('mongoose');

const ObjectId = mongoose.Types.ObjectId;

mongoose.set("strictQuery", false);
mongoose.connect('mongodb://localhost/ChatSocket', { useNewUrlParser: true, useUnifiedTopology: true , family: 4}, function(err) {
    if(err){
        console.log(err);
    } else {
        console.log('Connected to mongodb');
    }
});

require('./models/user.model');
require('./models/room.model');
require('./models/chat.model');
var User = mongoose.model('user');
var Room = mongoose.model('room');
var Chat = mongoose.model('chat');


app.use(express.static(__dirname + '/public'));

//Router
app.get('/',function(req,res){
    User.find((err, users) => {
        if(users){
            Room.find((err, channels) => {
                if(channels) {
                    res.render('index.ejs', {users: users, channels: channels})
                } else {
                    res.render('index.ejs', {users: users });
                }
            })
            
        } else{
            Room.find((err, channels) => {
                if(channels) {
                    res.render('index.ejs', {channels: channels});
                } else {
                    res.render('index.ejs');
                }
            });
           
        }
        
    });
    });
//errer 404
app.use(function(req, res, next){
        res.setHeader('Content-type','text/html');
        res.status(404).send('Page introuvable !');
    });

//Io

    var io = require('socket.io')(server);
    var connectedUsers = [];

// Lorsqu'une personne arrive sur la vue index.ejs, la fonction ci-dessous se lance
    io.on('connection',(socket) => {
        
// On recoit 'pseudo' du fichier html
        socket.on('pseudo', (pseudo) => {
            User.findOne({pseudo: pseudo }, (err, user) => {

                if(user){
// On join automatiquement le channel "salon1" par défaut
                    _joinRoom('salon1');
// On conserve le pseudo dans la variable socket qui est propre à chaque utilisateur
                    socket.pseudo = pseudo;
                    connectedUsers.push(socket);
// On previent les autres
                    socket.broadcast.to(socket.channel).emit('newUser',pseudo);
                } else {
                    var user = new User();
                    user.pseudo = pseudo;
                    user.save();
                    _joinRoom('salon1');
        
        
                    socket.pseudo = pseudo;
                    connectedUsers.push(socket);
                    socket.broadcast.to(socket.channel).emit('newUser', pseudo);
                    socket.broadcast.emit('newUserInDb', pseudo)
                }

        
            });
        });

        socket.on('oldWhispers', (pseudo) => {
            Chat.find({ receiver: pseudo }, (err, messages) => {
          
                if(err) {
                    return false;
                } else{
                  socket.emit('oldWhispers', messages);
                }
          
            }).limit(3);
          });

          socket.on('changeChannel', (channel) => {
            _joinRoom(channel);
        });

// Quand un nouveau message est envoyé
        socket.on('newMessage', (message, receiver) => {
            if(receiver === "all"){
        
                var chat = new Chat();
                chat._id_room = socket.channel;
                chat.content = message;
                chat.sender = socket.pseudo;
                chat.receiver = receiver;
                chat.save();
                
                
                socket.broadcast.to(socket.channel).emit('newMessageAll', {message: message, pseudo: socket.pseudo});
        
            } else {
                    
                User.findOne({ pseudo: receiver }, (err, user) => {

                    if(!user){
                        return false;
                    } else {
                    socketReceiver = connectedUsers.find(element => element.pseudo === user.pseudo);
            
                    if(socketReceiver) {
                        socketReceiver.emit('whisper', { sender: socket.pseudo, message:message });
                    }
                    
                    var chat = new Chat();
                    chat.content = message;
                    chat.sender = socket.pseudo;
                    chat.receiver = receiver;
                    chat.save();
                    }
            
                    });
            }
            
        
        });

        socket.on('writting',(pseudo) => {
            socket.broadcast.to(socket.channel).emit('writting',pseudo);
        });

        socket.on('notWritting', () => {
            socket.broadcast.to(socket.channel).emit('notWritting');
        });

// Quand un user se déconnecte
        socket.on('disconnect',() => {
            var index = connectedUsers.indexOf(socket);
            if(index > -1) {
                connectedUsers.splice(index, 1);
            }
            socket.broadcast.to(socket.channel).emit('quitUser', socket.pseudo);
        });

//Functions

        function _joinRoom(channelParam) {

//Si l'utilisateur est déjà dans un channel, on le stock
            var previousChannel = '';
            if(socket.channel) {
                previousChannel = socket.channel;
            }
//On quitte tous les channels et on rejoint le channel ciblé
            socket.leaveAll();
            socket.join(channelParam);
            socket.channel = channelParam;

            Room.findOne({ name: socket.channel }, (err, channel) =>{
                if(channel){
                    Chat.find({ _id_room: socket.channel }, (err, messages) =>{
                        if(!messages) {
                            return false;
                        } else {
                              socket.emit('oldMessages',messages, socket.pseudo);
                            if(previousChannel) {
                                socket.emit('emitChannel', { previousChannel: previousChannel, newChannel: socket.channel})
                            } else {
                                socket.emit('emitChannel', { newChannel: socket.channel})
                            }
                        }
                    });
                } else {
                    var room = new Room();
                    room.name = socket.channel;
                    room.save();

                    socket.broadcast.emit('newChannel', socket.channel);
                    socket.emit('emitChannel', { previousChannel: previousChannel, newChannel: socket.channel});
                }
            });

        }




    });




server.listen(8080, () => console.log('Server started at port: 8080'));