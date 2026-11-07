const fs=require("node:fs/promises"),path=require("node:path"),{packApp}=require("@matiq-solutions/sdk/package-app.cjs");
(async()=>{
 const root=path.resolve(__dirname,".."),manifest=require("../matiq-tool.json"),target=process.platform+"-"+process.arch;
 if(!["darwin","win32"].includes(process.platform))throw Error("Package the qualified native standalone on macOS or Windows.");
 if(!process.env.MATIQ_TOOL_SIGNING_KEY)throw Error("Use the protected tool-release publisher before packaging a release.");
 const resources=process.platform==="darwin"?path.join(root,"dist",process.arch==="arm64"?"mac-arm64":"mac","MatiQ Voice"+".app/Contents/Resources"):path.join(root,"dist","win"+(process.arch==="arm64"?"-arm64":"")+"-unpacked/resources");
 const name="MatiQ-Voice"+"-"+manifest.version+"-"+target+".mqt",output=path.join(root,"dist",name);
 const url="https://github.com/GoMatiQ-inc/matiq-voice/releases/download/v"+manifest.version+"/"+name;
 const release=await packApp({resources,manifest,target,extra:["engine", "native"],output,url,privateKey:process.env.MATIQ_TOOL_SIGNING_KEY});
 console.log("Packaged independent suite tool:",name,release.signed.packages[target].bytes,"bytes");
})().catch(error=>{console.error(error.message);process.exit(1);});
