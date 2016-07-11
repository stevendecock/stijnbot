/*~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
           ______     ______     ______   __  __     __     ______
          /\  == \   /\  __ \   /\__  _\ /\ \/ /    /\ \   /\__  _\
          \ \  __<   \ \ \/\ \  \/_/\ \/ \ \  _"-.  \ \ \  \/_/\ \/
           \ \_____\  \ \_____\    \ \_\  \ \_\ \_\  \ \_\    \ \_\
            \/_____/   \/_____/     \/_/   \/_/\/_/   \/_/     \/_/


This is a sample Slack bot built with Botkit.

This bot demonstrates many of the core features of Botkit:

* Connect to Slack using the real time API
* Receive messages based on "spoken" patterns
* Reply to messages
* Use the conversation system to ask questions
* Use the built in storage system to store and retrieve information
  for a user.

# RUN THE BOT:

  Get a Bot token from Slack:

    -> http://my.slack.com/services/new/bot

  Run your bot from the command line:

    token=<MY TOKEN> node slack_bot.js

# USE THE BOT:

  Find your bot inside Slack to send it a direct message.

  Say: "Hello"

  The bot will reply "Hello!"

  Say: "who are you?"

  The bot will tell you its name, where it is running, and for how long.

  Say: "Call me <nickname>"

  Tell the bot your nickname. Now you are friends.

  Say: "who am I?"

  The bot will tell you your nickname, if it knows one for you.

  Say: "shutdown"

  The bot will ask if you are sure, and then shut itself down.

  Make sure to invite your bot into other channels using /invite @<my bot>!

# EXTEND THE BOT:

  Botkit has many features for building cool and useful bots!

  Read all about it here:

    -> http://howdy.ai/botkit

~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~*/


if (!process.env.token) {
    console.log('Error: Specify token in environment');
    process.exit(1);
}

var Botkit = require('../node_modules/botkit/lib/Botkit.js');
var os = require('os');

var controller = Botkit.slackbot({
    debug: true,
    json_file_store: 'db'
});

var numberOfUsers = 0;

var bot = controller.spawn({
    token: process.env.token
}).startRTM(function(err,bot,payload) {
    if (err) {
        throw new Error('Could not connect to Slack');
    }

    numberOfUsers = payload.users.length;
});

controller.hears(['hello', 'hi'], 'direct_message,direct_mention,mention', function(bot, message) {

    bot.api.reactions.add({
        timestamp: message.ts,
        channel: message.channel,
        name: 'robot_face',
    }, function(err, res) {
        if (err) {
            bot.botkit.log('Failed to add emoji reaction :(', err);
        }
    });


    controller.storage.users.get(message.user, function(err, user) {
        if (user && user.name) {
            bot.reply(message, 'Hello ' + user.name + '!!');
        } else {
            bot.reply(message, 'Hello.');
        }
    });
});

controller.hears(['call me (.*)', 'my name is (.*)'], 'direct_message,direct_mention,mention', function(bot, message) {
    var name = message.match[1];
    controller.storage.users.get(message.user, function(err, user) {
        if (!user) {
            user = {
                id: message.user,
            };
        }
        user.name = name;
        controller.storage.users.save(user, function(err, id) {
            bot.reply(message, 'Got it. I will call you ' + user.name + ' from now on.');
        });
    });
});

controller.hears(['what is my name', 'who am i'], 'direct_message,direct_mention,mention', function(bot, message) {

    controller.storage.users.get(message.user, function(err, user) {
        if (user && user.name) {
            bot.reply(message, 'Your name is ' + user.name);
        } else {
            bot.startConversation(message, function(err, convo) {
                if (!err) {
                    convo.say('I do not know your name yet!');
                    convo.ask('What should I call you?', function(response, convo) {
                        convo.ask('You want me to call you `' + response.text + '`?', [
                            {
                                pattern: 'yes',
                                callback: function(response, convo) {
                                    // since no further messages are queued after this,
                                    // the conversation will end naturally with status == 'completed'
                                    convo.next();
                                }
                            },
                            {
                                pattern: 'no',
                                callback: function(response, convo) {
                                    // stop the conversation. this will cause it to end with status == 'stopped'
                                    convo.stop();
                                }
                            },
                            {
                                default: true,
                                callback: function(response, convo) {
                                    convo.repeat();
                                    convo.next();
                                }
                            }
                        ]);

                        convo.next();

                    }, {'key': 'nickname'}); // store the results in a field called nickname

                    convo.on('end', function(convo) {
                        if (convo.status == 'completed') {
                            bot.reply(message, 'OK! I will update my dossier...');

                            controller.storage.users.get(message.user, function(err, user) {
                                if (!user) {
                                    user = {
                                        id: message.user,
                                    };
                                }
                                user.name = convo.extractResponse('nickname');
                                controller.storage.users.save(user, function(err, id) {
                                    bot.reply(message, 'Got it. I will call you ' + user.name + ' from now on.');
                                });
                            });



                        } else {
                            // this happens if the conversation ended prematurely for some reason
                            bot.reply(message, 'OK, nevermind!');
                        }
                    });
                }
            });
        }
    });
});


controller.hears(['shutdown'], 'direct_message,direct_mention,mention', function(bot, message) {

    bot.startConversation(message, function(err, convo) {

        convo.ask('Are you sure you want me to shutdown?', [
            {
                pattern: bot.utterances.yes,
                callback: function(response, convo) {
                    convo.say('Bye!');
                    convo.next();
                    setTimeout(function() {
                        process.exit();
                    }, 3000);
                }
            },
        {
            pattern: bot.utterances.no,
            default: true,
            callback: function(response, convo) {
                convo.say('*Phew!*');
                convo.next();
            }
        }
        ]);
    });
});


controller.hears(['uptime', 'identify yourself', 'who are you', 'what is your name'],
    'direct_message,direct_mention,mention', function(bot, message) {

        var hostname = os.hostname();
        var uptime = formatUptime(process.uptime());

        bot.reply(message,
            ':robot_face: I am a bot named <@' + bot.identity.name +
             '>. I have been running for ' + uptime + ' on ' + hostname + '.');

    });

function formatUptime(uptime) {
    var unit = 'second';
    if (uptime > 60) {
        uptime = uptime / 60;
        unit = 'minute';
    }
    if (uptime > 60) {
        uptime = uptime / 60;
        unit = 'hour';
    }
    if (uptime != 1) {
        unit = unit + 's';
    }

    uptime = uptime + ' ' + unit;
    return uptime;
}

/*
 Custom code for stijnbot
 */
var teller = 0;
var lastDateSinceHappinessQuestion;
var treshold = 20;

controller.hears(['not happy', 'niet blij'], 'direct_message,direct_mention,mention', function(bot, message) {

    bot.api.reactions.add({
        timestamp: message.ts,
        channel: message.channel,
        name: 'camel',
    }, function(err, res) {
        if (err) {
            bot.botkit.log('Failed to add emoji reaction :(', err);
        }
    });

    controller.storage.users.get(message.user, function(err, user) {
        if (user && user.name) {
            bot.reply(message, user.name + ' niet blij?');
        } else {
            bot.reply(message, 'Ben je niet blij?');
        }
    });
});

controller.hears(['was ik blij?'], 'direct_message,direct_mention,mention', function (bot, message) {
    controller.storage.users.get(message.user, function(err, user_data) {
        if (user_data !== undefined) {
            bot.reply(message, 'U was ' + (user_data.blij ? 'blij' : 'niet blij'));
        } else {
            bot.reply(message, 'Ik heb geen idee.');
        }
    });
});

controller.hears(['is het team blij?'], 'direct_message,direct_mention,mention', function (bot, message) {
    controller.storage.users.all(function (err, all_user_data) {
        var aantalHappy = 0;
        var aantalUnhappy = 0;
        all_user_data.forEach(function (user) {
            if (user.blij)  {
                aantalHappy++;
            } else {
                aantalUnhappy++;
            }
        });
        bot.reply(message, 'Van het team zijn er ' + aantalHappy + ' blij, ' + aantalUnhappy + ' niet blij. Van ' + (numberOfUsers - aantalHappy - aantalUnhappy) + ' teamleden weet ik het niet .');
    });
});

controller.on('ambient', function (bot, message) {
    teller++;
    controller.storage.users.get(message.user, function(err, user_data) {
        var tempDate = new Date();
        if (user_data === undefined) {
            user_data = {id: message.user}
        }
        console.log('user_data.lastDateSinceHappinessQuestion (' + message.user + '): ' + user_data.lastDateSinceHappinessQuestion);
        if (user_data.blij === undefined || user_data.lastDateSinceHappinessQuestion === undefined || secondsDiff(user_data.lastDateSinceHappinessQuestion, tempDate) > treshold) {
            bot.startPrivateConversation(message, function (err, convo) {
                if (!err) {
                    convo.ask('Ben je blij?', [
                        {
                            pattern: 'ja',
                            callback: function (response, convo) {
                                user_data.blij = true;
                                user_data.lastDateSinceHappinessQuestion = tempDate;
                                controller.storage.users.save(user_data, function(err) {});
                                bot.reply(response, 'ideaal!');
                                convo.stop();
                            }
                        },
                        {
                            pattern: 'nee',
                            callback: function (response, convo) {
                                user_data.blij = false;
                                user_data.lastDateSinceHappinessQuestion = tempDate;
                                controller.storage.users.save(user_data, function(err) {});
                                bot.reply(response, 'oei, dat is spijtig');
                                convo.stop();
                            }
                        }
                    ]);
                }
            });
        }
    });
});

function daydiff(first, second) {
    return Math.round((second - first) / (1000 * 60 * 60 * 24));
}

function secondsDiff(first, second) {
    return Math.round((second.getTime() - first.getTime()) / (1000));
}
