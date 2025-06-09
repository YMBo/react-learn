/**
 * Copyright (c) Facebook, Inc. and its affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @flow
 */

import {canUseDOM} from 'shared/ExecutionEnvironment';

/**
 * 🚀
 * 安全检测选项支持,是否支持addEventListener第三个参数为object
 * 
 * 检查第三个参数passive是否支持，主要用于针对滚动操作的passive的优化，提升性能
 * 
 * 在旧版本的 DOM 规范中，第三个参数 addEventListener()是一个布尔值，指示是否使用捕获。随着时间的推移，很明显需要更多的选择。不是向函数添加更多参数（在处理可选值时使事情变得非常复杂），而是将第三个参数更改为一个对象，该对象可以包含定义选项值的各种属性，以配置删除事件侦听器的过程。
 * 
 * 因为旧浏览器（以及一些不太旧的浏览器）仍然假定第三个参数是布尔值，所以您需要构建代码来智能地处理这种情况。您可以通过对您感兴趣的每个选项使用特征检测来做到这一点。
 * 例如，如果要检查passive选项：
 * 
 * https://developer.mozilla.org/en-US/docs/Web/API/EventTarget/addEventListener#Safely_detecting_option_support

 */
export let passiveBrowserEventsSupported = false;

// Check if browser support events with passive listeners
// https://developer.mozilla.org/en-US/docs/Web/API/EventTarget/addEventListener#Safely_detecting_option_support

if (canUseDOM) {
  try {
    const options = {};
    // $FlowFixMe: Ignore Flow complaining about needing a value
    Object.defineProperty(options, 'passive', {
      get: function() {
        passiveBrowserEventsSupported = true;
      },
    });
    window.addEventListener('test', options, options);
    window.removeEventListener('test', options, options);
  } catch (e) {
    passiveBrowserEventsSupported = false;
  }
}
