#import <Cocoa/Cocoa.h>
#import <ApplicationServices/ApplicationServices.h>

int main(int argc, const char *argv[]) {
    @autoreleasepool {
        if (argc == 2 && strcmp(argv[1], "capture") == 0) {
            printf("%d\n", NSWorkspace.sharedWorkspace.frontmostApplication.processIdentifier);
            return 0;
        }
        if (argc == 3 && strcmp(argv[1], "paste") == 0) {
            if (!AXIsProcessTrusted()) {
                fprintf(stderr, "Enable Verbatim in System Settings > Privacy & Security > Accessibility, then retry. Your transcript is available to copy.\n");
                return 77;
            }
            pid_t target = atoi(argv[2]);
            if (target <= 0 || NSWorkspace.sharedWorkspace.frontmostApplication.processIdentifier != target) {
                fprintf(stderr, "The active app changed. Copy your transcript and paste it into the intended field.\n");
                return 78;
            }
            CGEventRef down = CGEventCreateKeyboardEvent(NULL, 9, true);
            CGEventRef up = CGEventCreateKeyboardEvent(NULL, 9, false);
            if (!down || !up) return 79;
            CGEventSetFlags(down, kCGEventFlagMaskCommand);
            CGEventSetFlags(up, kCGEventFlagMaskCommand);
            CGEventPost(kCGHIDEventTap, down);
            CGEventPost(kCGHIDEventTap, up);
            CFRelease(down);
            CFRelease(up);
            return 0;
        }
        fprintf(stderr, "Use capture or paste <process-id>.\n");
        return 64;
    }
}
