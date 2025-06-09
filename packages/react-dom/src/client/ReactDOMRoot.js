/**
 * Copyright (c) Facebook, Inc. and its affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @flow
 */

import type {MutableSource, ReactNodeList} from 'shared/ReactTypes';
import type {
  FiberRoot,
  TransitionTracingCallbacks,
} from 'react-reconciler/src/ReactInternalTypes';

import {queueExplicitHydrationTarget} from '../events/ReactDOMEventReplaying';
import {REACT_ELEMENT_TYPE} from 'shared/ReactSymbols';

export type RootType = {
  render(children: ReactNodeList): void,
  unmount(): void,
  _internalRoot: FiberRoot | null,
  ...
};

export type CreateRootOptions = {
  unstable_strictMode?: boolean,
  unstable_concurrentUpdatesByDefault?: boolean,
  identifierPrefix?: string,
  onRecoverableError?: (error: mixed) => void,
  transitionCallbacks?: TransitionTracingCallbacks,
  ...
};

export type HydrateRootOptions = {
  // Hydration options
  hydratedSources?: Array<MutableSource<any>>,
  onHydrated?: (suspenseNode: Comment) => void,
  onDeleted?: (suspenseNode: Comment) => void,
  // Options for all roots
  unstable_strictMode?: boolean,
  unstable_concurrentUpdatesByDefault?: boolean,
  identifierPrefix?: string,
  onRecoverableError?: (error: mixed) => void,
  ...
};

import {
  isContainerMarkedAsRoot,
  markContainerAsRoot,
  unmarkContainerAsRoot,
} from './ReactDOMComponentTree';
/** 🚀 引入的时候通过registerEvents()往allNativeEvents注册了事件 */
import {listenToAllSupportedEvents} from '../events/DOMPluginEventSystem';
import {
  ELEMENT_NODE,
  COMMENT_NODE,
  DOCUMENT_NODE,
  DOCUMENT_FRAGMENT_NODE,
} from '../shared/HTMLNodeType';

import {
  createContainer,
  createHydrationContainer,
  updateContainer,
  findHostInstanceWithNoPortals,
  registerMutableSourceForHydration,
  flushSync,
  isAlreadyRendering,
} from 'react-reconciler/src/ReactFiberReconciler';
import {ConcurrentRoot} from 'react-reconciler/src/ReactRootTags';
import {
  allowConcurrentByDefault,
  disableCommentsAsDOMContainers,
} from 'shared/ReactFeatureFlags';

/* global reportError */
const defaultOnRecoverableError =
  typeof reportError === 'function'
    ? // In modern browsers, reportError will dispatch an error event,
      // emulating an uncaught JavaScript error.
      reportError
    : (error: mixed) => {
        // In older browsers and test environments, fallback to console.error.
        // eslint-disable-next-line react-internal/no-production-logging
        console['error'](error);
      };

function ReactDOMRoot(internalRoot: FiberRoot) {
  /**
   * _internalRoot 保存的是FiberRootNode跟节点
   */
  this._internalRoot = internalRoot;
}

/** 🚀 render方法 */
ReactDOMHydrationRoot.prototype.render = ReactDOMRoot.prototype.render = function(
  children: ReactNodeList,
): void {
  // 🚀 拿到根节点的FiberRootNode
  const root = this._internalRoot;
  if (root === null) {
    throw new Error('Cannot update an unmounted root.');
  }

  if (__DEV__) {
    if (typeof arguments[1] === 'function') {
      console.error(
        'render(...): does not support the second callback argument. ' +
          'To execute a side effect after rendering, declare it in a component body with useEffect().',
      );
    } else if (isValidContainer(arguments[1])) {
      console.error(
        'You passed a container to the second argument of root.render(...). ' +
          "You don't need to pass it again since you already passed it to create the root.",
      );
    } else if (typeof arguments[1] !== 'undefined') {
      console.error(
        'You passed a second argument to root.render(...) but it only accepts ' +
          'one argument.',
      );
    }

    /** 🚀 containerInfo保存的是ReactDOM.createRoot传入的DOM节点*/
    const container = root.containerInfo;

    /** 🚀 如果不是注释节点 */
    /** 🚀 这部分是找到root.current下的第一个组件对应的dom节点 */
    if (container.nodeType !== COMMENT_NODE) {
      const hostInstance = findHostInstanceWithNoPortals(root.current);
      if (hostInstance) {
        if (hostInstance.parentNode !== container) {
          console.error(
            'render(...): It looks like the React-rendered content of the ' +
              'root container was removed without using React. This is not ' +
              'supported and will cause errors. Instead, call ' +
              "root.unmount() to empty a root's container.",
          );
        }
      }
    }
  }
  //
  updateContainer(children, root, null, null);
};

ReactDOMHydrationRoot.prototype.unmount = ReactDOMRoot.prototype.unmount = function(): void {
  if (__DEV__) {
    if (typeof arguments[0] === 'function') {
      console.error(
        'unmount(...): does not support a callback argument. ' +
          'To execute a side effect after rendering, declare it in a component body with useEffect().',
      );
    }
  }
  const root = this._internalRoot;
  if (root !== null) {
    this._internalRoot = null;
    const container = root.containerInfo;
    if (__DEV__) {
      if (isAlreadyRendering()) {
        console.error(
          'Attempted to synchronously unmount a root while React was already ' +
            'rendering. React cannot finish unmounting the root until the ' +
            'current render has completed, which may lead to a race condition.',
        );
      }
    }
    flushSync(() => {
      updateContainer(null, root, null, null);
    });
    unmarkContainerAsRoot(container);
  }
};

export function createRoot(
  container: Element | Document | DocumentFragment,
  options?: CreateRootOptions,
): RootType {
  /** 🚀 校验容器节点 */
  if (!isValidContainer(container)) {
    throw new Error('createRoot(...): Target container is not a DOM element.');
  }
  // 🚀 在dev环境下 1、如果DOM容器是body则提示error 2、如果已经render过了则提示error
  warnIfReactDOMContainerInDEV(container);

  let isStrictMode = false;
  let concurrentUpdatesByDefaultOverride = false;
  let identifierPrefix = '';
  let onRecoverableError = defaultOnRecoverableError;
  let transitionCallbacks = null;

  if (options !== null && options !== undefined) {
    if (__DEV__) {
      if ((options: any).hydrate) {
        console.warn(
          'hydrate through createRoot is deprecated. Use ReactDOMClient.hydrateRoot(container, <App />) instead.',
        );
      } else {
        if (
          typeof options === 'object' &&
          options !== null &&
          (options: any).$$typeof === REACT_ELEMENT_TYPE
        ) {
          console.error(
            'You passed a JSX element to createRoot. You probably meant to ' +
              'call root.render instead. ' +
              'Example usage:\n\n' +
              '  let root = createRoot(domContainer);\n' +
              '  root.render(<App />);',
          );
        }
      }
    }
    // 🚀 开启严格模式
    if (options.unstable_strictMode === true) {
      isStrictMode = true;
    }
    if (
      allowConcurrentByDefault &&
      options.unstable_concurrentUpdatesByDefault === true
    ) {
      concurrentUpdatesByDefaultOverride = true;
    }
    // 🚀 React.useId生成id的前缀
    if (options.identifierPrefix !== undefined) {
      identifierPrefix = options.identifierPrefix;
    }
    // 🚀  当 React 自动从错误中恢复时调用的可选回调
    if (options.onRecoverableError !== undefined) {
      onRecoverableError = options.onRecoverableError;
    }
    if (options.transitionCallbacks !== undefined) {
      transitionCallbacks = options.transitionCallbacks;
    }
  }

  /** 🚀 创建根fiber节点 */
  const root = createContainer(
    container,
    ConcurrentRoot,
    null,
    isStrictMode,
    concurrentUpdatesByDefaultOverride,
    identifierPrefix,
    onRecoverableError,
    transitionCallbacks,
  );

  // 🚀 给DOM容器做标记为根节点hostRoot
  markContainerAsRoot(root.current, container);

  /** 🚀 获取DOM节点，如果是comment节点则取父级元素 */
  const rootContainerElement: Document | Element | DocumentFragment =
    container.nodeType === COMMENT_NODE
      ? (container.parentNode: any)
      : container;
  /** 🚀 注册事件 */
  listenToAllSupportedEvents(rootContainerElement);

  return new ReactDOMRoot(root);
}

function ReactDOMHydrationRoot(internalRoot: FiberRoot) {
  this._internalRoot = internalRoot;
}
function scheduleHydration(target: Node) {
  if (target) {
    queueExplicitHydrationTarget(target);
  }
}
ReactDOMHydrationRoot.prototype.unstable_scheduleHydration = scheduleHydration;

export function hydrateRoot(
  container: Document | Element,
  initialChildren: ReactNodeList,
  options?: HydrateRootOptions,
): RootType {
  if (!isValidContainer(container)) {
    throw new Error('hydrateRoot(...): Target container is not a DOM element.');
  }

  warnIfReactDOMContainerInDEV(container);

  if (__DEV__) {
    if (initialChildren === undefined) {
      console.error(
        'Must provide initial children as second argument to hydrateRoot. ' +
          'Example usage: hydrateRoot(domContainer, <App />)',
      );
    }
  }

  // For now we reuse the whole bag of options since they contain
  // the hydration callbacks.
  const hydrationCallbacks = options != null ? options : null;
  // TODO: Delete this option
  const mutableSources = (options != null && options.hydratedSources) || null;

  let isStrictMode = false;
  let concurrentUpdatesByDefaultOverride = false;
  let identifierPrefix = '';
  let onRecoverableError = defaultOnRecoverableError;
  if (options !== null && options !== undefined) {
    if (options.unstable_strictMode === true) {
      isStrictMode = true;
    }
    if (
      allowConcurrentByDefault &&
      options.unstable_concurrentUpdatesByDefault === true
    ) {
      concurrentUpdatesByDefaultOverride = true;
    }
    if (options.identifierPrefix !== undefined) {
      identifierPrefix = options.identifierPrefix;
    }
    if (options.onRecoverableError !== undefined) {
      onRecoverableError = options.onRecoverableError;
    }
  }

  const root = createHydrationContainer(
    initialChildren,
    null,
    container,
    ConcurrentRoot,
    hydrationCallbacks,
    isStrictMode,
    concurrentUpdatesByDefaultOverride,
    identifierPrefix,
    onRecoverableError,
    // TODO(luna) Support hydration later
    null,
  );
  markContainerAsRoot(root.current, container);
  // This can't be a comment node since hydration doesn't work on comment nodes anyway.
  listenToAllSupportedEvents(container);

  if (mutableSources) {
    for (let i = 0; i < mutableSources.length; i++) {
      const mutableSource = mutableSources[i];
      registerMutableSourceForHydration(root, mutableSource);
    }
  }

  return new ReactDOMHydrationRoot(root);
}

export function isValidContainer(node: any): boolean {
  return !!(
    node &&
    /** 🚀 元素节点 */
    (node.nodeType === ELEMENT_NODE ||
      /** 🚀 文档节点 */
      node.nodeType === DOCUMENT_NODE ||
      /** 🚀 虚拟节点（createDocumentFragment，插入后不会产生元素节点） */
      node.nodeType === DOCUMENT_FRAGMENT_NODE ||
      /** 🚀  是否允许注释节点作为react DOM的容器，这里禁用 true */
      (!disableCommentsAsDOMContainers &&
        /** 🚀 校验节点类型 == 8 */
        node.nodeType === COMMENT_NODE &&
        /** 🚀 节点值必须是 ' react-mount-point-unstable '*/
        (node: any).nodeValue === ' react-mount-point-unstable '))
  );
}

// TODO: Remove this function which also includes comment nodes.
// We only use it in places that are currently more relaxed.
export function isValidContainerLegacy(node: any): boolean {
  return !!(
    node &&
    (node.nodeType === ELEMENT_NODE ||
      node.nodeType === DOCUMENT_NODE ||
      node.nodeType === DOCUMENT_FRAGMENT_NODE ||
      (node.nodeType === COMMENT_NODE &&
        (node: any).nodeValue === ' react-mount-point-unstable '))
  );
}

/**
 * 🚀 在dev环境下
 * 1、如果DOM容器是body则提示error
 * 2、如果已经render过了则提示error
 */
function warnIfReactDOMContainerInDEV(container: any) {
  if (__DEV__) {
    if (
      container.nodeType === ELEMENT_NODE &&
      ((container: any): Element).tagName &&
      ((container: any): Element).tagName.toUpperCase() === 'BODY'
    ) {
      console.error(
        'createRoot(): Creating roots directly with document.body is ' +
          'discouraged, since its children are often manipulated by third-party ' +
          'scripts and browser extensions. This may lead to subtle ' +
          'reconciliation issues. Try using a container element created ' +
          'for your app.',
      );
    }
    if (isContainerMarkedAsRoot(container)) {
      if (container._reactRootContainer) {
        console.error(
          'You are calling ReactDOMClient.createRoot() on a container that was previously ' +
            'passed to ReactDOM.render(). This is not supported.',
        );
      } else {
        console.error(
          'You are calling ReactDOMClient.createRoot() on a container that ' +
            'has already been passed to createRoot() before. Instead, call ' +
            'root.render() on the existing root instead if you want to update it.',
        );
      }
    }
  }
}
