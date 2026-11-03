#define main MatiQNativeKeyboardMain
#include "../native/mac-keys.m"
#undef main
#include <assert.h>
static CGEventRef eventFor(int key, bool down, CGEventFlags flags, bool modifier) {
    CGEventRef event=CGEventCreateKeyboardEvent(NULL,key,down);
    CGEventSetIntegerValueField(event,kCGEventSourceUnixProcessID,0);
    CGEventSetFlags(event,flags);if(modifier)CGEventSetType(event,kCGEventFlagsChanged);return event;
}
int main(void) {
    @autoreleasepool {
        pressed=[NSMutableSet new];swallowed=[NSMutableSet new];bindings=@[@[@55,@49]];
        CGEventRef left=eventFor(55,true,NX_DEVICELCMDKEYMASK,true);keyboard(NULL,kCGEventFlagsChanged,left,NULL);
        CGEventRef right=eventFor(54,true,NX_DEVICELCMDKEYMASK|NX_DEVICERCMDKEYMASK,true);keyboard(NULL,kCGEventFlagsChanged,right,NULL);
        assert([pressed containsObject:@55]&&[pressed containsObject:@54]);
        CGEventRef releaseRight=eventFor(54,false,NX_DEVICELCMDKEYMASK,true);keyboard(NULL,kCGEventFlagsChanged,releaseRight,NULL);
        assert([pressed containsObject:@55]&&![pressed containsObject:@54]);
        CGEventRef space=eventFor(49,true,NX_DEVICELCMDKEYMASK,false);assert(keyboard(NULL,kCGEventKeyDown,space,NULL)==NULL);assert(keyboard(NULL,kCGEventKeyDown,space,NULL)==NULL);
        CGEventRef spaceUp=eventFor(49,false,NX_DEVICELCMDKEYMASK,false);assert(keyboard(NULL,kCGEventKeyUp,spaceUp,NULL)==NULL);
        CGEventRef paste=eventFor(9,true,NX_DEVICELCMDKEYMASK,false);CGEventSetIntegerValueField(paste,kCGEventSourceUserData,0x4d51564f);keyboard(NULL,kCGEventKeyDown,paste,NULL);assert(![pressed containsObject:@9]);
        CFRelease(left);CFRelease(right);CFRelease(releaseRight);CFRelease(space);CFRelease(spaceUp);CFRelease(paste);
        fprintf(stderr,"Native keyboard fixture passed: left/right coexistence, release, suppression, repeat and own paste ignored.\n");
    }
}
