$ErrorActionPreference = 'Stop'
Add-Type -ReferencedAssemblies System.Windows.Forms,System.Web.Extensions -TypeDefinition @'
using System;
using System.Collections.Generic;
using System.Runtime.InteropServices;
using System.Threading;
using System.Web.Script.Serialization;
using System.Windows.Forms;
public static class MatiQKeys {
  delegate IntPtr Hook(int code, IntPtr message, IntPtr data);
  [StructLayout(LayoutKind.Sequential)] struct Key { public uint vk,scan,flags,time; public UIntPtr extra; }
  [DllImport("user32.dll",SetLastError=true)] static extern IntPtr SetWindowsHookEx(int kind,Hook handler,IntPtr module,uint thread);
  [DllImport("user32.dll")] static extern IntPtr CallNextHookEx(IntPtr hook,int code,IntPtr message,IntPtr data);
  [DllImport("user32.dll")] static extern bool UnhookWindowsHookEx(IntPtr hook);
  [DllImport("kernel32.dll")] static extern IntPtr GetModuleHandle(string name);
  static Hook callback=OnKey; static IntPtr hook; static object gate=new object();
  static HashSet<int> pressed=new HashSet<int>(), swallowed=new HashSet<int>();
  static List<HashSet<int>> bindings=new List<HashSet<int>>(); static bool learning;
  static void Write(string value) { Console.WriteLine(value); Console.Out.Flush(); }
  static IntPtr OnKey(int code,IntPtr message,IntPtr data) {
    if(code<0) return CallNextHookEx(hook,code,message,data);
    Key key=(Key)Marshal.PtrToStructure(data,typeof(Key));
    if((key.flags&16)!=0) return CallNextHookEx(hook,code,message,data);
    int msg=message.ToInt32(); bool down=msg==0x100||msg==0x104, up=msg==0x101||msg==0x105;
    if(!down&&!up) return CallNextHookEx(hook,code,message,data);
    int k=(int)key.vk;
    if(k==16) k=key.scan==0x36?161:160;
    if(k==17) k=(key.flags&1)!=0?163:162;
    if(k==18) k=(key.flags&1)!=0?165:164;
    if(k==13&&(key.flags&1)!=0) k=269;
    bool consume;
    lock(gate) {
      bool repeat=down&&pressed.Contains(k); if(down) pressed.Add(k);else pressed.Remove(k);
      consume=swallowed.Contains(k);
      bool modifier=(k>=160&&k<=165)||k==91||k==92;
      if(down&&!modifier) {
        if(learning) consume=true;
        foreach(var binding in bindings) if(binding.Count>0&&binding.IsSubsetOf(pressed)) consume=true;
        if(consume) swallowed.Add(k);
      }
      if(up) swallowed.Remove(k);
      if(!repeat) Write("{\"key\":"+k+",\"down\":"+(down?"true":"false")+"}");
    }
    return consume?new IntPtr(1):CallNextHookEx(hook,code,message,data);
  }
  public static void Run() {
    hook=SetWindowsHookEx(13,callback,GetModuleHandle(null),0);
    if(hook==IntPtr.Zero) throw new Exception("Windows keyboard access failed. Restart MatiQ Voice and try again.");
    var reader=new Thread(()=>{
      string line;var json=new JavaScriptSerializer();
      while((line=Console.ReadLine())!=null) {
        var config=json.Deserialize<Dictionary<string,object>>(line);
        lock(gate) {
          learning=config.ContainsKey("learning")&&(bool)config["learning"];
          bindings.Clear();pressed.Clear();
          foreach(object group in (System.Collections.IEnumerable)config["bindings"]) {
            var set=new HashSet<int>();foreach(object value in (System.Collections.IEnumerable)group) set.Add(Convert.ToInt32(value));bindings.Add(set);
          }
        }
      }
      Environment.Exit(0);
    });reader.IsBackground=true;reader.Start();Write("{\"ready\":true}");
    try{Application.Run();}finally{UnhookWindowsHookEx(hook);}
  }
}
'@
[MatiQKeys]::Run()
