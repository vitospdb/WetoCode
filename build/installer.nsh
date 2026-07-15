!include FileFunc.nsh
!include LogicLib.nsh

!ifndef BUILD_UNINSTALLER
  !macro customPageAfterChangeDir
    Page custom NormalizeWetoCodeInstallDirectory
  !macroend

  !macro customInit
    !insertmacro UninstallBrokenWetoCode HKEY_CURRENT_USER "/currentuser"
    ${If} ${UAC_IsAdmin}
      !insertmacro UninstallBrokenWetoCode HKEY_LOCAL_MACHINE "/allusers"
    ${EndIf}
    ${If} ${Silent}
      Call EnsureWetoCodeInstallDirectory
    ${EndIf}
  !macroend

  !macro UninstallBrokenWetoCode ROOT_KEY INSTALL_MODE
    ReadRegStr $R5 ${ROOT_KEY} "${UNINSTALL_REGISTRY_KEY}" "DisplayVersion"
    ${If} $R5 == "0.2.0"
    ${OrIf} $R5 == "0.2.1"
      ReadRegStr $R6 ${ROOT_KEY} "${INSTALL_REGISTRY_KEY}" "InstallLocation"
      ${If} $R6 != ""
      ${AndIf} ${FileExists} "$R6\Uninstall ${PRODUCT_FILENAME}.exe"
        InitPluginsDir
        CopyFiles /SILENT "$R6\Uninstall ${PRODUCT_FILENAME}.exe" "$PLUGINSDIR\legacy-uninstaller.exe"
        ExecWait '"$PLUGINSDIR\legacy-uninstaller.exe" /NCRC /S /KEEP_APP_DATA ${INSTALL_MODE} --updated _?=$R6' $R7
        ${If} $R7 != 0
          MessageBox MB_OK|MB_ICONSTOP "无法移除 WetoCode $R5（错误代码 $R7）。请联系 WetoCode 支持。"
          SetErrorLevel 2
          Quit
        ${EndIf}
      ${EndIf}
    ${EndIf}
  !macroend

  Function NormalizeWetoCodeInstallDirectory
    Call EnsureWetoCodeInstallDirectory
    Abort
  FunctionEnd

  Function EnsureWetoCodeInstallDirectory
    ${GetFileName} "$INSTDIR" $0
    ${If} $0 != "${APP_FILENAME}"
      StrCpy $INSTDIR "$INSTDIR\${APP_FILENAME}"
    ${EndIf}
  FunctionEnd
!endif
