# ProGuard/R8 rules for the Umbra Vale native shell.
#
# The game itself is a web bundle inside the WebView, so nothing here affects
# gameplay code. These rules exist because Capacitor discovers plugins and
# bridges JavaScript calls through reflection and annotations — without them
# R8 would strip classes and methods that are only referenced dynamically.

# Capacitor bridge, plugin base classes and every bundled plugin.
-keep class com.getcapacitor.** { *; }
-keep @com.getcapacitor.annotation.CapacitorPlugin public class * {
    @com.getcapacitor.PluginMethod public <methods>;
}
-keep public class * extends com.getcapacitor.Plugin { *; }
-keepclassmembers class * {
    @com.getcapacitor.PluginMethod public <methods>;
}

# Cordova plugins bridged through Capacitor's compatibility layer.
-keep class org.apache.cordova.** { *; }

# Anything exposed to JavaScript via @JavascriptInterface.
-keepclassmembers class * {
    @android.webkit.JavascriptInterface <methods>;
}

# Capacitor reads plugin metadata from annotations at runtime.
-keepattributes *Annotation*, Signature, InnerClasses, EnclosingMethod

# Keep readable stack traces for crash reports while still obfuscating.
-keepattributes SourceFile,LineNumberTable
-renamesourcefileattribute SourceFile
