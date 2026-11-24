const fs=require('node:fs/promises');
const path=require('node:path');
const {randomUUID}=require('node:crypto');
const {validateWav}=require('./core.cjs');

// Acknowledgement follows the durable save, never merely receipt of the stop request.
function createQuitSave({directory,send,finishMeeting,afterSave,timeout=30000}) {
  let pending=null;
  return {
    request() {
      if(pending)return pending.promise;
      let resolve,reject;
      const promise=new Promise((yes,no)=>{resolve=yes;reject=no;});
      const token=randomUUID(),timer=setTimeout(()=>{if(pending?.token===token){pending=null;reject(Error('Recording did not finish saving. Keep Voice open and retry Quit.'));}},timeout);
      pending={token,promise,resolve,reject,timer,saving:false};
      try{send({type:'save-before-quit',token});}catch(error){clearTimeout(timer);pending=null;reject(error);}
      return promise;
    },
    async accept(value) {
      const request=pending;
      if(!request||request.token!==value?.token||request.saving)throw Error('No matching recording save request. Retry Quit from the application menu.');
      request.saving=true;
      // Disk completion owns the outcome once saving starts; it must not be timed out and replayed.
      clearTimeout(request.timer);
      try {
        if(value.error)throw Error(String(value.error).slice(0,1000));
        let file=null;
        if(value.audio) {
          const audio=validateWav(value.audio);
          await fs.mkdir(directory,{recursive:true,mode:0o700});
          file=path.join(directory,'dictation-'+request.token+'.wav');
          const handle=await fs.open(file+'.partial','wx',0o600);
          try{await handle.writeFile(audio);await handle.sync();}finally{await handle.close();}
          await fs.rename(file+'.partial',file);
        } else await finishMeeting();
        await afterSave(file);
        pending=null;request.resolve();return {saved:true};
      } catch(error) {pending=null;request.reject(error);throw error;}
    }
  };
}
module.exports={createQuitSave};
