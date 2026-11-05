#import <Cocoa/Cocoa.h>
#import <ApplicationServices/ApplicationServices.h>

static AXError focusedElement(AXUIElementRef system, CFTypeRef *element) {
    AXError error = AXUIElementCopyAttributeValue(system, kAXFocusedUIElementAttribute, element);
    if (error == kAXErrorSuccess && *element) return error;
    pid_t pid = NSWorkspace.sharedWorkspace.frontmostApplication.processIdentifier;
    if (pid <= 0) return error;
    AXUIElementRef application = AXUIElementCreateApplication(pid);
    error = AXUIElementCopyAttributeValue(application, kAXFocusedUIElementAttribute, element);
    CFRelease(application);
    return error;
}

int main(int argc, const char *argv[]) {
    @autoreleasepool {
        if (argc == 2 && (strcmp(argv[1], "permissions") == 0 || strcmp(argv[1], "request-permissions") == 0)) {
            BOOL request=strcmp(argv[1], "request-permissions")==0;
            BOOL trusted=AXIsProcessTrustedWithOptions((CFDictionaryRef)@{(id)kAXTrustedCheckOptionPrompt:@(request)});
            printf("{\"accessibility\":%s}\n",trusted?"true":"false"); return 0;
        }
        if (argc == 2 && strcmp(argv[1], "session") == 0) {
            if (!AXIsProcessTrusted()) {
                fprintf(stderr, "Enable MatiQ Voice in Privacy & Security > Accessibility. Use Copy until permission is granted.\n"); return 77;
            }
            AXUIElementRef system = AXUIElementCreateSystemWide();
            CFTypeRef original = NULL;
            if (focusedElement(system, &original) != kAXErrorSuccess || !original) {
                CFRelease(system); fprintf(stderr, "The focused text field is unavailable. Use Copy.\n"); return 78;
            }
            CFTypeRef role = NULL, subrole = NULL;
            AXUIElementCopyAttributeValue((AXUIElementRef)original, kAXRoleAttribute, &role);
            AXUIElementCopyAttributeValue((AXUIElementRef)original, kAXSubroleAttribute, &subrole);
            bool supported = role && (CFEqual(role, kAXTextFieldRole) || CFEqual(role, kAXTextAreaRole) || CFEqual(role, kAXComboBoxRole));
            bool secure = subrole && CFEqual(subrole, CFSTR("AXSecureTextField"));
            if (role) CFRelease(role); if (subrole) CFRelease(subrole);
            if (!supported || secure) { CFRelease(original); CFRelease(system); fprintf(stderr, "This field does not support reliable destination tracking. Use Copy.\n"); return 78; }
            pid_t originalPid = 0; AXUIElementGetPid((AXUIElementRef)original, &originalPid);
            CFTypeRef selection = NULL; CFRange originalRange = CFRangeMake(0, 0); bool hasRange = false;
            if (AXUIElementCopyAttributeValue((AXUIElementRef)original, kAXSelectedTextRangeAttribute, &selection) == kAXErrorSuccess && selection) {
                hasRange = AXValueGetValue((AXValueRef)selection, kAXValueCFRangeType, &originalRange); CFRelease(selection);
            }
            printf("ready\n"); fflush(stdout);
            char command[32]; bool paste = fgets(command, sizeof(command), stdin) && strcmp(command, "paste\n") == 0;
            NSString *insertion = nil;
            if (paste) {
                char *payload = NULL; size_t capacity = 0;
                ssize_t length = getline(&payload, &capacity, stdin);
                if (length > 0 && length < 500000) {
                    NSData *json = [NSData dataWithBytes:payload length:(NSUInteger)length];
                    id value = [NSJSONSerialization JSONObjectWithData:json options:NSJSONReadingFragmentsAllowed error:nil];
                    if ([value isKindOfClass:NSString.class]) insertion = value;
                }
                free(payload);
                if (!insertion.length) { CFRelease(original); CFRelease(system); fprintf(stderr, "No insertion text was supplied. Use Copy.\n"); return 79; }
            }
            int result = 0;
            if (paste) {
                // Let pending accessibility focus notifications settle before posting keys.
                CFRunLoopRunInMode(kCFRunLoopDefaultMode, 0.15, false);
                CFTypeRef current = NULL;
                bool same = focusedElement(system, &current) == kAXErrorSuccess && current && CFEqual(current, original);
                if (current) CFRelease(current);
                if (same && hasRange) {
                    CFTypeRef value = NULL; CFRange range;
                    same = AXUIElementCopyAttributeValue((AXUIElementRef)original, kAXSelectedTextRangeAttribute, &value) == kAXErrorSuccess && value && AXValueGetValue((AXValueRef)value, kAXValueCFRangeType, &range) && range.location == originalRange.location && range.length == originalRange.length;
                    if (value) CFRelease(value);
                }
                if (!same) { fprintf(stderr, "The selected text field or caret changed. Copy the transcript into the intended field.\n"); result = 78; }
                else {
                    if (!hasRange) { CFRelease(original); CFRelease(system); fprintf(stderr, "This field does not expose a reliable text cursor. Use Copy.\n"); return 78; }
                    if (![[NSPasteboard.generalPasteboard stringForType:NSPasteboardTypeString] isEqualToString:insertion]) {
                        CFRelease(original); CFRelease(system); fprintf(stderr, "The clipboard changed before insertion. Copy the transcript again.\n"); return 78;
                    }
                    // Insert without deleting highlighted text. Never rewrite the field's value.
                    if (originalRange.length > 0) {
                        CFRange caret = CFRangeMake(originalRange.location, 0);
                        AXValueRef selected = AXValueCreate(kAXValueCFRangeType, &caret);
                        AXError collapsed = AXUIElementSetAttributeValue((AXUIElementRef)original, kAXSelectedTextRangeAttribute, selected);
                        CFRelease(selected);
                        CFTypeRef verified = NULL; CFRange range;
                        bool preserved = collapsed == kAXErrorSuccess && AXUIElementCopyAttributeValue((AXUIElementRef)original, kAXSelectedTextRangeAttribute, &verified) == kAXErrorSuccess && verified && AXValueGetValue((AXValueRef)verified, kAXValueCFRangeType, &range) && range.location == originalRange.location && range.length == 0;
                        if (verified) CFRelease(verified);
                        if (!preserved) { CFRelease(original); CFRelease(system); fprintf(stderr, "The selected text cannot be preserved safely. Use Copy.\n"); return 78; }
                    }
                    CGEventRef down = CGEventCreateKeyboardEvent(NULL, 9, true), up = CGEventCreateKeyboardEvent(NULL, 9, false);
                    if (!down || !up) result = 79;
                    else { CGEventSetIntegerValueField(down, kCGEventSourceUserData, 0x4d51564f); CGEventSetIntegerValueField(up, kCGEventSourceUserData, 0x4d51564f); CGEventSetFlags(down, kCGEventFlagMaskCommand); CGEventSetFlags(up, kCGEventFlagMaskCommand); CGEventPostToPid(originalPid, down); CGEventPostToPid(originalPid, up); }
                    if (down) CFRelease(down); if (up) CFRelease(up);
                }
            }
            CFRelease(original); CFRelease(system); return result;
        }
        if (argc == 2 && strcmp(argv[1], "capture") == 0) {
            printf("%d\n", NSWorkspace.sharedWorkspace.frontmostApplication.processIdentifier);
            return 0;
        }
        if (argc == 3 && strcmp(argv[1], "paste") == 0) {
            if (!AXIsProcessTrusted()) {
                fprintf(stderr, "Enable MatiQ Voice in System Settings > Privacy & Security > Accessibility, then retry. Your transcript is available to copy.\n");
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
            CGEventSetIntegerValueField(down, kCGEventSourceUserData, 0x4d51564f); CGEventSetIntegerValueField(up, kCGEventSourceUserData, 0x4d51564f); CGEventSetFlags(down, kCGEventFlagMaskCommand);
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
