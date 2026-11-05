#import <Cocoa/Cocoa.h>
#import <ApplicationServices/ApplicationServices.h>
#import <IOKit/hidsystem/IOLLEvent.h>

static CFMachPortRef tap;
static NSMutableSet<NSNumber *> *pressed, *swallowed;
static NSArray<NSArray<NSNumber *> *> *bindings;
static NSMutableDictionary<NSNumber *, NSValue *> *pending;
static NSMutableOrderedSet<NSNumber *> *pendingOrder;
static BOOL learning = NO;
static void output(NSDictionary *value) {
    NSData *json=[NSJSONSerialization dataWithJSONObject:value options:0 error:nil];
    fwrite(json.bytes,1,json.length,stdout); fputc('\n',stdout); fflush(stdout);
}
static void releasePending(CGEventTapProxy proxy, NSNumber *key, BOOL replay) {
    NSValue *value = pending[key];
    if (!value) return;
    CGEventRef event = (CGEventRef)value.pointerValue;
    if (replay) CGEventTapPostEvent(proxy, event);
    CFRelease(event); [pending removeObjectForKey:key]; [pendingOrder removeObject:key];
}
static CGEventRef keyboard(CGEventTapProxy proxy, CGEventType type, CGEventRef event, void *context) {
    @autoreleasepool {
    if(type==kCGEventTapDisabledByTimeout || type==kCGEventTapDisabledByUserInput) {
        [pressed removeAllObjects]; [swallowed removeAllObjects];
        for (NSNumber *key in [[pendingOrder.array copy] autorelease]) releasePending(proxy, key, NO);
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
    BOOL consume=[swallowed containsObject:number], member=NO;
    if(down) {
        for(NSArray *binding in bindings) {
            if([binding containsObject:number]) member=YES;
            if(binding.count && [[NSSet setWithArray:binding] isSubsetOfSet:pressed]) {
                for(NSNumber *bound in binding) {
                    releasePending(proxy, bound, NO);
                    [swallowed addObject:bound];
                }
                consume=YES;
            }
        }
        if(learning && type!=kCGEventFlagsChanged) consume=YES;
        if(!consume && type!=kCGEventFlagsChanged) {
            if(member && !repeated) {
                pending[number]=[NSValue valueWithPointer:CGEventCreateCopy(event)];
                [pendingOrder addObject:number];
                consume=YES;
            } else {
                // A repeat is ordinary navigation; unrelated input ends a prefix.
                for(NSNumber *key in [[pendingOrder.array copy] autorelease]) releasePending(proxy, key, YES);
            }
        }
        if(consume && !pending[number]) [swallowed addObject:number];
    } else {
        releasePending(proxy, number, !consume);
        [swallowed removeObject:number];
    }
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
        pressed=[NSMutableSet new]; swallowed=[NSMutableSet new]; bindings=[NSArray new]; pending=[NSMutableDictionary new]; pendingOrder=[NSMutableOrderedSet new];
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
                    for(NSNumber *key in [[pendingOrder.array copy] autorelease]) releasePending(NULL, key, NO);
                }); CFRunLoopWakeUp(CFRunLoopGetMain());
                }
            }
            free(line); exit(0);
        });
        output(@{@"ready":@YES}); CFRunLoopRun(); CFRelease(source); CFRelease(tap);
    }
    return 0;
}
