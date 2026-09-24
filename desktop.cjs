const { app, BrowserWindow, Menu, dialog, shell, session, ipcMain } = require('electron');
const path = require('node:path');
const fs = require('node:fs');
const { pathToFileURL } = require('node:url');
app.setName('Token info');
app.setAppUserModelId('no.local.tokeninfo');
app.setPath('userData', path.join(app.getPath('appData'), 'Token info'));
const locked = app.requestSingleInstanceLock();
let win, service, quitting = false;
let languageSettings, translate = key => ({startError:'Token info could not start',restart:'Please reopen Token info. Your data has been preserved.'})[key] || key;
const settingsFile = path.join(app.getPath('userData'), 'window.json');
function focusWindow() {
  if (!win || win.isDestroyed()) return;
  if (win.isMinimized()) win.restore();
  win.show(); win.focus();
}
if (!locked || process.argv.includes('--quit')) app.quit();
else {
  app.on('second-instance', (_event,argv) => argv.includes('--quit') ? app.quit() : focusWindow());
  app.on('window-all-closed', () => app.quit());
  app.on('before-quit', event => {
    if (quitting) return;
    quitting = true; event.preventDefault();
    Promise.resolve(service?.close()).finally(()=>app.quit());
  });
  app.whenReady().then(async()=>{
    const {LanguageSettings} = await import(pathToFileURL(path.join(__dirname,'language-settings.mjs')).href);
    const {translator} = await import(pathToFileURL(path.join(__dirname,'public','i18n.js')).href);
    languageSettings = new LanguageSettings(path.join(app.getPath('userData'),'language.json'));
    translate = translator(languageSettings.get());
    Menu.setApplicationMenu(null);
    session.defaultSession.setPermissionRequestHandler((_contents,_permission,callback)=>callback(false));
    session.defaultSession.setPermissionCheckHandler(()=>false);
    const {createService} = await import(pathToFileURL(path.join(__dirname,'server.mjs')).href);
    const {CustomProjects} = await import(pathToFileURL(path.join(__dirname,'custom-projects.mjs')).href);
    const customProjects = new CustomProjects(path.join(app.getPath('userData'),'projects.json'));
    service = createService({port:0,getCustomProjects:()=>customProjects.list()});
    const origin = await service.start();
    let settings = {};
    try { settings = JSON.parse(fs.readFileSync(settingsFile,'utf8')); } catch {}
    const clamp = (n,min,max,fallback) => Number.isFinite(n) ? Math.max(min,Math.min(max,n)) : fallback;
    win = new BrowserWindow({
      title:'Token info',width:clamp(settings.width,760,2400,1260),height:clamp(settings.height,580,1600,900),
      minWidth:760,minHeight:580,show:false,backgroundColor:'#f3f5f0',
      icon:path.join(__dirname,'assets','token-info.ico'),autoHideMenuBar:true,
      webPreferences:{preload:path.join(__dirname,'preload.cjs'),nodeIntegration:false,contextIsolation:true,sandbox:true,backgroundThrottling:false,spellcheck:false}
    });
    let selectingFolder = false;
    const trusted = event => event.sender === win.webContents && event.senderFrame === win.webContents.mainFrame && new URL(event.senderFrame.url).origin === origin;
    ipcMain.handle('ti-language:get',event=>{
      if (!trusted(event)) throw new Error('Invalid sender');
      return languageSettings.get();
    });
    ipcMain.handle('ti-language:set',(event,language)=>{
      if (!trusted(event)) throw new Error('Invalid sender');
      try { languageSettings.set(language); translate=translator(language); return {language}; }
      catch { return {error:'languageSaveError'}; }
    });
    for (const action of ['list','add','remove']) ipcMain.handle(`ti-projects:${action}`,async(event,id)=>{
      if (!trusted(event)) throw new Error('Ugyldig avsender.');
      try {
        if (action === 'add') {
          if (selectingFolder) return {projects:customProjects.list()};
          selectingFolder = true;
          try {
            const selection = await dialog.showOpenDialog(win,{title:translate('folderDialog'),buttonLabel:translate('selectFolder'),properties:['openDirectory']});
            if (!selection.canceled && selection.filePaths[0]) customProjects.add(selection.filePaths[0]);
          } finally { selectingFolder = false; }
        }
        if (action === 'remove') {
          if (typeof id !== 'string' || !id.startsWith('ti:')) throw new Error('Ugyldig prosjekt.');
          customProjects.remove(id);
        }
        if (action !== 'list') service.refreshLocal();
        return {projects:customProjects.list()};
      } catch(error) { return {error:error.message}; }
    });
    win.on('page-title-updated',event=>{event.preventDefault();win.setTitle('Token info');});
    win.on('close',()=>{
      if (!win.isMinimized()) {
        const {width,height}=win.getNormalBounds();
        try {fs.mkdirSync(path.dirname(settingsFile),{recursive:true});fs.writeFileSync(settingsFile,JSON.stringify({width,height,maximized:win.isMaximized()}));} catch {}
      }
    });
    win.webContents.setWindowOpenHandler(({url})=>{
      if (url==='https://learn.chatgpt.com/docs/app-server') shell.openExternal(url);
      return {action:'deny'};
    });
    win.webContents.on('will-navigate',(event,url)=>{if (new URL(url).origin!==origin) event.preventDefault();});
    win.webContents.on('render-process-gone',()=>{if(!quitting)win.reload();});
    win.once('ready-to-show',()=>{if(settings.maximized)win.maximize();focusWindow();});
    await win.loadURL(origin);
  }).catch(error=>{
    dialog.showErrorBox(translate('startError'), translate('restart'));
    app.quit();
  });
}
