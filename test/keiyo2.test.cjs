"use strict";
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const express = require('express');

// 実際のExpressサーバーを空いているポートで起動し、HTTPで確認する。
test('京葉線CRUDと第7〜9回の画面・登録が動作する', async t => {
  const root = path.join(__dirname, '..');
  let server;
  const createApp = () => {
    const app = express();
    app.set('views', path.join(root, 'views'));
    const listen = app.listen.bind(app);
    app.listen = () => { server = listen(0, '127.0.0.1'); return server; };
    return app;
  };
  Object.assign(createApp, express);
  vm.runInNewContext(fs.readFileSync(path.join(root, 'app5.js'), 'utf8'), {
    require: name => name === 'express' ? createApp : require(name),
    __dirname: root, console: { log() {} }
  });
  t.after(() => new Promise(resolve => server.close(resolve)));
  await new Promise(resolve => server.once('listening', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  async function request(url, data) {
    return fetch(base + url, data === undefined ? { redirect: 'manual' } : {
      method: 'POST', redirect: 'manual', body: new URLSearchParams(data)
    });
  }
  const station = { code: 'JE99', name: 'テスト駅', change: 'テスト線', passengers: '123', distance: '45.6' };
  for (const url of ['/keiyo2', '/keiyo2/0', '/keiyo2/edit/0', '/public/keiyo2_new.html',
    '/keiyo', '/keiyo/plain', '/menu', '/public/janken2.html', '/public/menu_add.html']) {
    assert.equal((await request(url)).status, 200, url);
  }
  const create = await request('/keiyo2/create');
  assert.equal(create.status, 302);
  assert.equal(create.headers.get('location'), '/public/keiyo2_new.html');
  for (const url of ['/keiyo2/999', '/keiyo2/-1', '/keiyo2/abc', '/keiyo2/edit/999', '/keiyo2/delete/999']) {
    assert.equal((await request(url)).status, 404, url);
  }
  assert.equal((await request('/keiyo2', station)).status, 303);
  assert.match(await (await request('/keiyo2/7')).text(), /テスト駅/);
  assert.equal((await request('/keiyo2/update/7', { ...station, name: '更新駅' })).status, 303);
  assert.match(await (await request('/keiyo2/7')).text(), /更新駅/);
  // 確認画面を開いただけでは削除されない。
  assert.match(await (await request('/keiyo2/delete/1')).text(), /八丁堀駅/);
  assert.match(await (await request('/keiyo2/1')).text(), /八丁堀駅/);
  assert.equal((await request('/keiyo2/delete/1', {})).status, 303);
  assert.doesNotMatch(await (await request('/keiyo2')).text(), /八丁堀駅/);
  // 削除で配列位置が変わった後も、正しい駅の編集先を使う。
  assert.match(await (await request('/keiyo2/edit/6')).text(), /action="\/keiyo2\/update\/6"/);
  assert.equal((await request('/keiyo2/update/6', { ...station, name: '削除後更新駅' })).status, 303);
  assert.equal((await request('/keiyo2', station)).status, 303);
  assert.match(await (await request('/keiyo2/7')).text(), /<td>9<\/td>/);
  assert.match(await (await request('/keiyo2/6')).text(), /削除後更新駅/);
  for (const invalid of [{ name: '' }, { passengers: '-1' }, { passengers: '1.2' }, { distance: 'abc' }, { distance: '-1' }]) {
    assert.equal((await request('/keiyo2', { ...station, ...invalid })).status, 400);
    assert.equal((await request('/keiyo2/update/0', { ...station, ...invalid })).status, 400);
  }
  assert.equal((await request('/keiyo2/update/999', station)).status, 404);
  assert.equal((await request('/keiyo2/delete/999', {})).status, 404);
  assert.match(await (await request('/keiyo2/0')).text(), /東京駅/);
  // HTMLとして解釈されず、入力した文字列として表示される。
  assert.equal((await request('/keiyo2_add', { ...station, name: '<script>alert(1)</script>' })).status, 303);
  assert.match(await (await request('/keiyo2/8')).text(), /&lt;script&gt;/);
  assert.equal((await request('/keiyo_add', { code: 'JE98', name: '旧課題の駅' })).status, 303);
  assert.match(await (await request('/keiyo')).text(), /旧課題の駅/);
  assert.equal((await request('/menu_add', { name: '確認カレー', category: 'カレー', price: '300' })).status, 303);
  assert.match(await (await request('/menu')).text(), /確認カレー/);
  assert.equal((await request('/menu_add', { name: '', category: 'カレー', price: '-1' })).status, 400);
  assert.equal((await request('/janken2?hand=' + encodeURIComponent('グー') + '&win=0&total=0')).status, 200);
});
