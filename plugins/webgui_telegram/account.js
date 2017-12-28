const telegram = appRequire('plugins/webgui_telegram/index').telegram;
const isUser = appRequire('plugins/webgui_telegram/index').isUser;
const account = appRequire('plugins/account/index');
const server = appRequire('plugins/flowSaver/server');
const config = appRequire('services/config').all();
const crypto = require('crypto');
const qr = require('qr-image');

const isGetAccount = message => {
  if(!message.message || !message.message.text) { return false; }
  if(!message.message || !message.message.chat || !message.message.chat.type === 'private') { return false; }
  if(message.message.text.trim() !== 'account') { return false; }
  return true;
};

const isCallbackAccount = message => {
  if(!message.callback_query || !message.callback_query.data) { return false; }
  if(!message.callback_query.data.match(/^accountId\[\d{1,}\]$/)) {
    return false;
  }
  return true;
};

const isCallbackServer = message => {
  if(!message.callback_query || !message.callback_query.data) { return false; }
  if(!message.callback_query.data.match(/^accountId\[\d{1,}\]serverId\[\d{1,}\]$/)) {
    return false;
  }
  return true;
};

telegram.on('message', async message => {
  if(isGetAccount(message)) {
    const telegramId = message.message.chat.id.toString();
    const userId = await isUser(telegramId);
    const myAccount = await account.getAccount({ userId });
    if(!myAccount.length) {
      return telegram.emit('send', telegramId, '当前并没有分配账号');
    }
    const keyboard = myAccount.map(m => {
      return {
        text: m.port.toString(),
        callback_data: `accountId[${ m.id }]`,
      };
    });
    telegram.emit('keyboard', telegramId, '请选择账号', {
      inline_keyboard: [
        keyboard
      ],
    });
  } else if(isCallbackAccount(message)) {
    const telegramId = message.callback_query.from.id.toString();
    const accountId = message.callback_query.data.match(/^accountId\[(\d{1,})\]$/)[1];
    const userId = await isUser(telegramId);
    const myAccount = (await account.getAccount({ userId, id: +accountId }))[0];
    if(!myAccount) { return; }
    let servers = await server.list();
    const validServers = JSON.parse(myAccount.server);
    servers = servers.filter(f => {
      if(!validServers) {
        return true;
      } else {
        return validServers.indexOf(f.id) >= 0;
      }
    });
    const serverArray = [];
    servers.forEach((server, index) => {
      if(index % 4 === 0) {
        serverArray.push([]);
      }
      serverArray[serverArray.length -1].push({
        text: server.name,
        callback_data: `accountId[${ myAccount.id }]serverId[${ server.id }]`,
      });
    });
    telegram.emit('keyboard', telegramId, '请选择服务器', {
      inline_keyboard: serverArray,
    });
  } else if(isCallbackServer(message)) {
    const telegramId = message.callback_query.from.id.toString();
    const accountId = message.callback_query.data.match(/^accountId\[(\d{1,})\]serverId\[\d{1,}\]$/)[1];
    const serverId = message.callback_query.data.match(/^accountId\[\d{1,}\]serverId\[(\d{1,})\]$/)[1];
    const userId = await isUser(telegramId);
    const myAccount = (await account.getAccount({ userId, id: +accountId }))[0];
    const myServer = (await server.list()).filter(server => {
      return server.id === +serverId;
    })[0];
    // console.log(myAccount);
    // console.log(myServer);
    if(!myAccount || !myServer) { return; }
    let returnMessage = '';
    const ssurl = 'ss://' + Buffer.from(`${ myServer.method }:${ myServer.password }@${ myServer.host }:${ myAccount.port }`).toString('base64');
    returnMessage += `地址：${ myServer.host }\n端口：${ myAccount.port }\n密码：${ myServer.password }\n加密方式：${ myServer.method }\n\n`;
    returnMessage += ssurl;
    telegram.emit('send', telegramId, returnMessage);
    const qrcodeId = crypto.randomBytes(32).toString('hex');
    qrcodeObj[qrcodeId] = { url: ssurl, time: Date.now() };
    telegram.emit('photo', telegramId, `${ config.plugins.webgui.site }/api/user/telegram/qrcode/${ qrcodeId }`);
  }
});

const qrcodeObj = {};

const qrcode = (req, res) => {
  for(const i in qrcodeObj) {
    if(Date.now() - qrcodeObj[i].time >= 5 * 60 * 1000) {
      delete qrcodeObj[i];
    }
  }
  const id = req.params.qrcodeId;
  const code = qr.image(qrcodeObj[id].url, { type: 'png', size: 7 });
  res.setHeader('Content-type', 'image/png');
  code.pipe(res);
};

exports.qrcode = qrcode;