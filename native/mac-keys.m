#import <Cocoa/Cocoa.h>
#import <ApplicationServices/ApplicationServices.h>
#import <IOKit/hidsystem/IOLLEvent.h>

static CFMachPortRef tap;
static NSMutableSet<NSNumber *> *pressed, *swallowed;
static NSArray<NSArray<NSNumber *> *> *bindings;
static BOOL learning = NO;
static void output(NSDictionary *value) {
    NSData *json=[NSJSONSerialization dataWithJSONObject:value options:0 error:nil];
    fwrite(json.bytes,1,json.length,stdout); fputc('\n',stdout); fflush(stdout);
}
static CGEventRef keyboard(CGEventTapProxy proxy, CGEventType type, CGEventRef event, void *context) {
    @autoreleasepool {
    if(type==kCGEventTapDisabledByTimeout || type==kCGEventTapDisabledByUserInput) {
        [pressed removeAllObjects]; [swallowed removeAllObjects];
        output(@{@"reset":@YES}); CGEventTapEnable(tap,true); return event;
    }
    if(CGEventGetIntegerValueField(event,kCGEventSourceUserData)==0x4d51564f || CGEventGetIntegerValueField(event,kCGEventSourceUnixProcessID)==getpid()) return event;
    int key=(int)CGEventGetIntegerValueField(event,kCGKeyboardEventKeycode);
    BOOL down=type==kCGEventKeyDown;
    if(type==kCGEventFlagsChanged) {
        CGEventFlags flags=CGEventGetFlags(event); uint64_t mask=0;
        switch(key) {
            case 55:mask=NX_DEVICELCMDKEYMASK;break; case 54:mask=NX_DEVICERCMDKEYMASK;break;
            case 56:mask=NX_DEVICELSHIFTKEYMASK;break;case 60:mask=NX_DEVICERSHIFTKEYMASK;break;
            case 59:mask=NX_DEVICELCTLKEYMASK;break;case 62:mask=NX_DEVICERCTLKEYMASK;break;
            case 58:mask=NX_DEVICELALTKEYMASK;break;case 61:mask=NX_DEVICERALTKEYMASK;break;
            case 63:mask=kCGEventFlagMaskSecondaryFn;break;
            default:down=CGEventSourceKeyState(kCGEventSourceStateCombinedSessionState,(CGKeyCode)key);break;
        }
        if(mask) down=(flags&mask)!=0;
    }
    NSNumber *number=@(key); BOOL repeated=down && [pressed containsObject:number];
    if(down) [pressed addObject:number]; else [pressed removeObject:number];
    BOOL consume=[swallowed containsObject:number];
    if(down && type!=kCGEventFlagsChanged) {
        for(NSArray *binding in bindings) if(binding.count && [[NSSet setWithArray:binding] isSubsetOfSet:pressed]) consume=YES;
        if(learning) consume=YES;
        if(consume) [swallowed addObject:number];
    }
    if(!down) [swallowed removeObject:number];
    if(!repeated) output(@{@"key":number,@"down":@(down)});
    return consume && type!=kCGEventFlagsChanged ? NULL : event;
    }
}
int main(int argc, const char *argv[]) {
    @autoreleasepool {
        BOOL requestAccess=argc>1 && strcmp(argv[1],"--request-access")==0;
        if(requestAccess && !AXIsProcessTrustedWithOptions((CFDictionaryRef)@{(id)kAXTrustedCheckOptionPrompt:@YES})) {
            fprintf(stderr,"Enable MatiQ Voice.app in System Settings > Privacy & Security > Accessibility, then return and click Check keyboard access again. Add the installed app, not this button or the mac-keys executable.\n"); return 77;
        }
        pressed=[NSMutableSet new]; swallowed=[NSMutableSet new]; bindings=[NSArray new];
        CGEventMask mask=CGEventMaskBit(kCGEventKeyDown)|CGEventMaskBit(kCGEventKeyUp)|CGEventMaskBit(kCGEventFlagsChanged);
        tap=CGEventTapCreate(kCGSessionEventTap,kCGHeadInsertEventTap,kCGEventTapOptionDefault,mask,keyboard,NULL);
        if(!tap) { if(requestAccess) CGRequestListenEventAccess(); fprintf(stderr,"Keyboard listening could not start. Enable MatiQ Voice.app in Privacy & Security > Accessibility and Input Monitoring, quit and reopen the app, then check keyboard access again.\n"); return 77; }
        CFRunLoopSourceRef source=CFMachPortCreateRunLoopSource(NULL,tap,0);
        CFRunLoopAddSource(CFRunLoopGetMain(),source,kCFRunLoopCommonModes); CGEventTapEnable(tap,true);
        dispatch_async(dispatch_get_global_queue(QOS_CLASS_USER_INITIATED,0),^{
            char *line=NULL;size_t size=0;
            while(getline(&line,&size,stdin)>0) {
                @autoreleasepool {
                NSData *data=[[NSString stringWithUTF8String:line] dataUsingEncoding:NSUTF8StringEncoding];
                NSDictionary *config=[NSJSONSerialization JSONObjectWithData:data options:0 error:nil];
                if(![config isKindOfClass:NSDictionary.class]) continue;
                CFRunLoopPerformBlock(CFRunLoopGetMain(),kCFRunLoopCommonModes,^{
                    [bindings release]; bindings=[(config[@"bindings"]?:@[]) copy];learning=[config[@"learning"] boolValue];
                    [pressed removeAllObjects];
                }); CFRunLoopWakeUp(CFRunLoopGetMain());
                }
            }
            free(line); exit(0);
        });
        output(@{@"ready":@YES}); CFRunLoopRun(); CFRelease(source); CFRelease(tap);
    }
    return 0;
}
