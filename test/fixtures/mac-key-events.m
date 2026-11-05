#import <Cocoa/Cocoa.h>
#import <ApplicationServices/ApplicationServices.h>
#import <unistd.h>

// Test-only injector: refuse to send events outside the owned fixture app.
int main(int argc, const char *argv[]) {
    @autoreleasepool {
        if (argc < 3) return 64;
        pid_t target = atoi(argv[1]);
        CGEventSourceRef source = CGEventSourceCreate(kCGEventSourceStatePrivate);
        for (int i = 2; i < argc; i++) {
            if (NSWorkspace.sharedWorkspace.frontmostApplication.processIdentifier != target) return 78;
            size_t length = strlen(argv[i]); char action = argv[i][length - 1];
            CGEventRef event = CGEventCreateKeyboardEvent(source, atoi(argv[i]), action != 'u');
            CGEventSetFlags(event, 0);
            CGEventSetIntegerValueField(event, kCGKeyboardEventAutorepeat, action == 'r');
            CGEventPost(kCGHIDEventTap, event); CFRelease(event); usleep(30000);
        }
        CFRelease(source); return 0;
    }
}
