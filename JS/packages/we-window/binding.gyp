{
  "targets": [
    {
      "target_name": "we_window",
      "sources": [
        "src/addon.cpp",
        "src/we_window.cpp",
        "src/dwm.cpp"
      ],
      "include_dirs": [
        "<!@(node -p \"require('node-addon-api').include\")",
        "include"
      ],
      "conditions": [
        ["OS=='win'", {
          "libraries": ["-ldwmapi.lib", "-luser32.lib", "-lgdi32.lib"],
          "msvs_settings": {
            "VCCLCompilerTool": {
              "ExceptionHandling": 1,
              "AdditionalOptions": ["/utf-8", "/W3"]
            }
          }
        }]
      ]
    }
  ]
}
