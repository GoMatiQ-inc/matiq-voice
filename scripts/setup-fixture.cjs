async function completeSetupWithAudio(page,audio){
 await page.evaluate(async bytes=>{
  const api=window.matiqVoice;
  for(const [id,value] of [['model','base.en'],['microphone-input','default'],['shortcuts','onscreen'],['paste','copy'],['meetings','none'],['startup','reviewed']])await api.setupFlow({command:'review',id,value});
  await api.microphoneTest(new Uint8Array(bytes));
  for(const id of ['download','microphone','permissions'])await api.setupFlow({command:'check',id});
  await api.setupFlow({command:'complete'});
 },audio);
}
module.exports={completeSetupWithAudio};
