@echo off
set "JAVA_HOME=C:\Program Files\Android\Android Studio4\jbr"
cd android
call gradlew.bat assembleDebug
