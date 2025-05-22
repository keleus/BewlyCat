name: 问题报告
description: 遇到错误请在此报告。
labels: [bug]

body:
  - type: markdown
    attributes:
      value: |
        标题不填或直接随便写类似“bug”“错误”“有问题”简单带过的 issue 直接 close + lock 不解释，如果是旧版本的问题或是已经有人提问过的问题将会关闭。

        功能请求不是在问题报告里面写的，请[开启空 issue](https://github.com/keleus/BewlyCat/issues/new)。

        若遇到页面相关问题（比如某页面下出现了不该出现的元素），我们建议一并附上发生问题的页面链接。

  - type: textarea
    attributes:
      label: 环境信息
      description: 【请勿修改 issue 模版。】扩展版本、浏览器版本、以及你做出的自定义设置。
      placeholder: |
        - 浏览器（如 Google Chrome）：
        - 浏览器版本（如 126.0.6478.126）：
        - BewlyCat 版本（如 1.0.3）：

        如果你修改了 BewlyCat 的设置，请写在下面以方便我們排查問題（可粗略写成类似“设置了××后出现这个问题”〔将“××”替换为你的设置项〕）：

      value: |
        - 浏览器（如 Google Chrome）：
        - 浏览器版本（如 126.0.6478.126）：
        - BewlyCat 版本（如 0.20.1）：

        如果你修改了 BewlyCat 的设置，请写在下面以方便我們排查問題（可粗略写成类似“设置了××后出现这个问题”〔将“××”替换为你的设置项〕）：

    validations:
      required: true

  - type: textarea
    attributes:
      label: 问题描述
      description: 如何重现，最好带有截图或视频以便排查。
      placeholder: |
        请预先搜索此问题是否在其他 issue 中出现过
    validations:
      required: true

  - type: textarea
    attributes:
      label: 预期行为
      description: 你认为应该是什么行为。
    validations:
      required: false

  - type: checkboxes
    attributes:
      label: 最终确认
      description: 请确认以下所有内容，否则将被 close。
      options:
        - label: 我确认在停用 BewlyCat 并强制刷新（按住 Shift 键的同时按刷新键）后，问题不再出现。
          required: false
        - label: 我确认此问题未在其他 issue 中出现过。
          required: false
        - label: 我确认我正在使用最新的 BewlyCat 版本。
          required: false
