const defaultOpts = {
  // required opts
  React: null,
  ReactDOM: null,

  // required - one or the other
  rootComponent: null,

  // optional opts
  renderType: null,
  errorBoundary: null,
  errorBoundaryClass: null,
  domElementGetter: null,
  appCanUpdate: true, // by default, allow app created with v-app-react to be updated
  suppressComponentDidCatchWarning: false,
  domElements: {},
  renderResults: {},
  updateResolves: {},
};

function createVAppRoot(opts) {
  // This is a class component, since we need a mount hook and v-app-react supports React@15 (no useEffect available)
  function VAppRoot(_props) {
    VAppRoot.displayName = `VAppRoot(${_props.name})`;
  }

  VAppRoot.prototype = Object.create(opts.React.Component.prototype);
  VAppRoot.prototype.componentDidMount = function () {
    setTimeout(this.props.mountFinished);
  };
  VAppRoot.prototype.componentWillUnmount = function () {
    setTimeout(this.props.unmountFinished);
  };
  VAppRoot.prototype.render = function () {
    // componentDidUpdate doesn't seem to be called during root.render() for updates
    setTimeout(this.props.updateFinished);

    return this.props.children;
  };

  return VAppRoot;
}

function reactDomRender({ opts, elementToRender, domElement }) {
  const renderType =
    typeof opts.renderType === 'function' ? opts.renderType() : opts.renderType;
  if (
    [
      'createRoot',
      'unstable_createRoot',
      'createBlockingRoot',
      'unstable_createBlockingRoot',
    ].indexOf(renderType) >= 0
  ) {
    const root = opts.ReactDOM[renderType](domElement);
    root.render(elementToRender);
    return root;
  }

  if (renderType === 'hydrate') {
    opts.ReactDOM.hydrate(elementToRender, domElement);
  } else {
    // default to this if 'renderType' is null or doesn't match the other options
    opts.ReactDOM.render(elementToRender, domElement);
  }

  // The reactDomRender function should return a react root, but ReactDOM.hydrate() and ReactDOM.render()
  // do not return a react root. So instead, we return null which indicates that there is no react root
  // that can be used for updates or unmounting
  return null;
}

function getElementToRender(opts, props, mountFinished) {
  const rootComponentElement = opts.React.createElement(
    opts.rootComponent,
    props
  );

  let elementToRender = rootComponentElement;

  elementToRender = opts.React.createElement(
    opts.VAppRoot,
    {
      ...props,
      mountFinished,
      updateFinished() {
        if (opts.updateResolves[props.name]) {
          opts.updateResolves[props.name].forEach((r) => r());
          delete opts.updateResolves[props.name];
        }
      },
      unmountFinished() {
        setTimeout(opts.unmountFinished);
      },
    },
    elementToRender
  );

  return elementToRender;

  //   const elementToRender = opts.React.createElement(opts.rootComponent, {
  //     ...props,
  //     mountFinished,
  //     updateFinished() {
  //       if (opts.updateResolves[props.name]) {
  //         opts.updateResolves[props.name].forEach(r => r());
  //         delete opts.updateResolves[props.name];
  //       }
  //     },
  //     unmountFinished() {
  //       setTimeout(opts.unmountFinished);
  //     }
  //   });

  //   return elementToRender;
}

function bootstrap(opts, props) {
  //   if (opts.rootComponent) {
  // This is a class or stateless function component
  return Promise.resolve();
  //   }
}

function mount(opts, props) {
  return new Promise((resolve, reject) => {
    if (!opts.suppressComponentDidCatchWarning && !opts.errorBoundary) {
      if (!opts.rootComponent.prototype) {
        console.warn(
          `v-app-react: ${
            props.name || props.appName || props.childAppName
          }'s rootComponent does not implement an error boundary.  If using a functional component, consider providing an opts.errorBoundary to VAppReact(opts).`
        );
      } else if (!opts.rootComponent.prototype.componentDidCatch) {
        console.warn(
          `v-app-react: ${
            props.name || props.appName || props.childAppName
          }'s rootComponent should implement componentDidCatch to avoid accidentally unmounting the entire V application.`
        );
      }
    }

    const whenMounted = () => {
      resolve(this);
    };

    const elementToRender = getElementToRender(opts, props, whenMounted);
    const { domElement } = props;
    const renderResult = reactDomRender({
      elementToRender,
      domElement,
      opts,
    });
    opts.domElements[props.name] = domElement;
    opts.renderResults[props.name] = renderResult;
  });
}

function unmount(opts, props) {
  return new Promise((resolve) => {
    opts.unmountFinished = resolve;

    const root = opts.renderResults[props.name];

    if (root && root.unmount) {
      // React >= 18
      const unmountResult = root.unmount();
    } else {
      // React < 18
      opts.ReactDOM.unmountComponentAtNode(opts.domElements[props.name]);
    }
    delete opts.domElements[props.name];
    delete opts.renderResults[props.name];
  });
}

function update(opts, props) {
  return new Promise((resolve) => {
    if (!opts.updateResolves[props.name]) {
      opts.updateResolves[props.name] = [];
    }

    opts.updateResolves[props.name].push(resolve);

    const elementToRender = getElementToRender(opts, props, null);
    const renderRoot = opts.renderResults[props.name];
    if (renderRoot && renderRoot.render) {
      // React 18 with ReactDOM.createRoot()
      renderRoot.render(elementToRender);
    } else {
      // React 16 / 17 with ReactDOM.render()
      const { domElement } = props;

      // This is the old way to update a react application - just call render() again
      opts.ReactDOM.render(elementToRender, domElement);
    }
  });
}

export default function VAppReact(userOpts) {
  if (typeof userOpts !== 'object') {
    throw new Error(`v-app-react requires a configuration object`);
  }

  const opts = {
    ...defaultOpts,
    ...userOpts,
  };

  if (!opts.React) {
    throw new Error(`v-app-react must be passed opts.React`);
  }

  if (!opts.ReactDOM) {
    throw new Error(`v-app-react must be passed opts.ReactDOM`);
  }

  if (!opts.rootComponent) {
    throw new Error(`v-app-react must be passed opts.rootComponent`);
  }

  if (opts.errorBoundary && typeof opts.errorBoundary !== 'function') {
    throw Error(
      `The errorBoundary opt for v-app-react must either be omitted or be a function that returns React elements`
    );
  }

  opts.VAppRoot = createVAppRoot(opts);

  const lifecycles = {
    bootstrap: bootstrap.bind(null, opts),
    mount: mount.bind(null, opts),
    unmount: unmount.bind(null, opts),
  };

  if (opts.appCanUpdate) {
    lifecycles.update = update.bind(null, opts);
  }

  return lifecycles;
}
