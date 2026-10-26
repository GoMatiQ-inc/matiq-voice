const {contextBridge, ipcRenderer} = require('electron');
const invoke = channel => (...args) => ipcRenderer.invoke(channel, ...args);
contextBridge.exposeInMainWorld('matiqVoice', {
  recordBinding: invoke('binding-record'), cancelBinding: invoke('binding-cancel'), enableKeyboard: invoke('keyboard-enable'),
  status: invoke('status'), settings: invoke('settings'), download: invoke('download'),
  begin: invoke('begin'), recordingReady: invoke('recording-ready'), transcribe: invoke('transcribe'),
  retry: invoke('retry'), cancel: invoke('cancel'), copy: invoke('copy'), clear: invoke('clear'),
  accessibility: invoke('accessibility'), meter: invoke('meter'),
  microphoneTest: invoke('setup-microphone-test'), completeSetup: invoke('setup-complete'), loginAtStartup: invoke('login-at-startup'),
  connect: invoke('oauth-connect'), cancelConnect: invoke('oauth-cancel'), disconnect: invoke('oauth-disconnect'), calendarEvents: invoke('calendar-events'), openMeeting: invoke('open-meeting'),
  listMeetings: invoke('meeting-list'), getMeeting: invoke('meeting-get'), beginMeeting: invoke('meeting-begin'), meetingReady: invoke('meeting-ready'),
  appendMeeting: invoke('meeting-chunk'), pauseMeeting: invoke('meeting-pause'), stopMeeting: invoke('meeting-stop'), processMeeting: invoke('meeting-process'),
  renameSpeaker: invoke('meeting-speaker'), saveNotes: invoke('meeting-notes'), deleteMeeting: invoke('meeting-delete'), exportMeeting: invoke('meeting-export'), quit: invoke('quit'),
  onEvent: callback => { const listener = (_, message) => callback(message); ipcRenderer.on('app-event', listener); return () => ipcRenderer.removeListener('app-event', listener); }
});
