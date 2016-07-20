import { remote } from 'electron';
const { BrowserWindow, getCurrentWindow } = remote;
import home from 'home-dir';
import fs from 'fs';
import path from 'path';
import { fromJS } from 'commutable';

import { deferURL } from '../../main/launch';

import Rx from 'rxjs/Rx';

const HOME = home();

/**
 * Turn a path like /Users/n/mine.ipynb to ~/mine.ipynb
 * @param  {string} p the full path to a file
 * @return {string}   tildified path
 */
export function tildify(p) {
  if (!p) {
    return '';
  }
  const s = path.normalize(p) + path.sep;
  return (s.indexOf(HOME) === 0 ? s.replace(HOME + path.sep, `~${path.sep}`) : s).slice(0, -1);
}

export function initNativeHandlers(store) {
  Rx.Observable.from(store)
    .map(state => {
      const { executionState } = state.app;
      const { filename } = state.metadata;
      return {
        title: `${tildify(filename) || 'Untitled'} - ${executionState}`,
        path: filename,
      };
    })
    .distinctUntilChanged()
    .debounceTime(200)
    .subscribe(res => {
      const win = getCurrentWindow();
      // TODO: Investigate if setRepresentedFilename() is a no-op on non-OS X
      if (res.path && win.setRepresentedFilename) {
        // TODO: this needs to be the full path to the file
        win.setRepresentedFilename(res.path);
      }
      win.setTitle(res.title);
    });
}

function launch(notebook, filename) {
  let win = new BrowserWindow({
    width: 800,
    height: 1000,
    title: !filename ? 'Untitled' : path.relative('.', filename.replace(/.ipynb$/, '')),
  });

  const index = path.join(__dirname, '..', '..', '..', 'static', 'index.html');
  win.loadURL(`file://${index}`);

  win.webContents.on('did-finish-load', () => {
    win.webContents.send('main:load', { notebook: notebook.toJS(), filename });
  });

  win.webContents.on('will-navigate', deferURL);

  win.on('closed', () => {
    win = null;
  });

  return win;
}

export function launchFilename(filename) {
  return new Promise((resolve, reject) => {
    fs.readFile(filename, {}, (err, data) => {
      if (err) {
        reject(err);
      } else {
        resolve(launch(fromJS(JSON.parse(data)), filename));
      }
    });
  });
}
