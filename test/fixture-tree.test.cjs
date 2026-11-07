const test=require("node:test"),assert=require("node:assert/strict"),{spawn}=require("node:child_process"),{once}=require("node:events"),{capture,captureTree}=require("../scripts/fixture-lifecycle.cjs"),{cleanupDesktop}=require("@matiq-solutions/sdk/fixture-cleanup.cjs");
test("the native fixture lifecycle captures a real owned child tree",{timeout:20000},async()=>{
 const script="const {spawn}=require('node:child_process');const child=spawn(process.execPath,['-e','setInterval(()=>{},1000)'],{stdio:'ignore'});process.stdout.write(String(child.pid));process.stdin.once('data',()=>{child.once('exit',()=>process.exit(0));child.kill();});",parent=spawn(process.execPath,["-e",script],{stdio:["pipe","pipe","ignore"]});let owned=[];
 try{const [data]=await once(parent.stdout,"data"),childPid=Number(data.toString());owned=captureTree(capture(parent));assert.ok(owned.some(row=>row.pid===parent.pid));assert.ok(owned.some(row=>row.pid===childPid));}
 finally{await cleanupDesktop({app:{process:()=>parent,close:async()=>{if(parent.exitCode===null&&parent.signalCode===null){const exit=once(parent,"exit");parent.stdin.end("stop");await exit;}}},owned});}
});
