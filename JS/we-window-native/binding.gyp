{
  "targets": [
    {
      "target_name": "we_window",
      "sources": [
        "src/binding.cc",
        "src/dwm.cc",
        "src/window.cc"
      ],
      "conditions": [
        ["OS==\"win\"", {
          "msvs_settings": {
            "VCCLCompilerTool": {
              "ExceptionHandling": 1,
              "AdditionalOptions": [
                "/utf-8"
              ]
            }
          },
          "msvs_version": "2022"
        }]
      ]
    }
  ],
  "variables": {
    "openssl_fips": 0
  }
}
