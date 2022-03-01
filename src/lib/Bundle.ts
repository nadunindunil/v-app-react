import * as React from 'react';

interface GlobalValues {
  unmounted: boolean;
  nextThingToDo: any;
}

interface VBundleProps {
  config: any;
  wrapWith: any;
  wrapStyle: any;
  wrapClassName: string;
  mountVBundle: any;
  appendTo: any;
  handleError: any;
  vBundleDidMount: any;
}

export default function VBundle({
  config,
  wrapWith,
  wrapStyle,
  wrapClassName,
  mountVBundle,
  appendTo,
  handleError,
  vBundleDidMount,
  ...props
}: VBundleProps) {
  if (!config) {
    throw new Error(
      `v-app-react's VBundle component requires the 'config' prop to either be a vBundle config or a loading function that returns a promise. See https://github.com/v-app/v-app-react`
    );
  }
  const [hasError, setHasError] = React.useState(false);
  const ref = React.useRef();
  const vBundleRef = React.useRef(null);

  // use to find initial mount
  const mounted = React.useRef(false);
  const { current: globalValues } = React.useRef<GlobalValues>({
    unmounted: false,
    nextThingToDo: null,
  });

  const getVBundleProps = () => {
    // Make sure domElement is a prop, so that the vBundle updates the correct domEl rather than creating a new one
    const vBundleProps = { ...props, domElement: ref };

    return vBundleProps;
  };

  const addThingToDo = (action: string, thing: any) => {
    if (hasError && action !== 'unmount') {
      // In an error state, we don't do anything anymore except for unmounting
      return;
    }

    globalValues.nextThingToDo = Promise.resolve()
      .then((...args) => {
        if (globalValues.unmounted && action !== 'unmount') {
          // Never do anything once the react component unmounts
          return;
        }

        return thing(...args);
      })
      .catch((err) => {
        globalValues.nextThingToDo = Promise.resolve(); // reset so we don't .then() the bad promise again

        setHasError(true);

        if (err && err.message) {
          err.message = `During '${action}', vBundle threw an error: ${err.message}`;
        }

        if (handleError) {
          handleError(err);
        } else {
          setTimeout(() => {
            throw err;
          });
        }

        // No more things to do should be done -- the vBundle is in an error state
        throw err;
      });
  };

  React.useEffect(() => {
    let vBundle: any = null;
    let createdDomElement: any;
    if (!mounted.current) {
      // do componentDidMount logic
      mounted.current = true;
      addThingToDo('mount', () => {
        const mountApp = mountVBundle;
        if (!mountApp) {
          throw new Error(`
            <VBundle /> was not passed a mountVBundle prop, nor is it rendered where mountVBundle is within the React context.
            If you are using <VBundle /> within a module that is not a v-app application, you will need to import mountRootVBundle from v-app and pass it into <VBundle /> as a mountVBundle prop	
        `);
        }
        let domElement: any;
        if (ref.current) {
          domElement = ref.current;
        } else {
          createdDomElement = domElement = document.createElement(wrapWith);
          Object.keys(wrapStyle).forEach((key) => {
            domElement.style[key] = wrapStyle[key];
          });
          //   appendTo.appendChild(domElement);
        }
        vBundle = mountApp(config, {
          ...getVBundleProps(),
          domElement,
        });
        vBundleRef.current = vBundle;
        vBundle.mountPromise().then(vBundleDidMount);
        return vBundle.mountPromise;
      });
    } else {
      addThingToDo('update', () => {
        if (vBundle && vBundle.update) {
          return vBundle.update(getVBundleProps());
        }
        vBundleRef.current = vBundle;
      });
    }

    return () => {
      addThingToDo('unmount', () => {
        if (vBundle && vBundle.getStatus() === 'MOUNTED') {
          return vBundle.unmount();
        }
      });
      vBundleRef.current = null;
      if (createdDomElement) {
        createdDomElement.parentNode.removeChild(createdDomElement);
      }
      globalValues.unmounted = true;
    };
  });

  const handleRef = (el: any) => {
    ref.current = el;
  };

  return React.createElement(
    wrapWith,
    {
      ref: handleRef,
      style: wrapStyle,
      className: wrapClassName,
    },
    undefined
  );
}

VBundle.defaultProps = {
  wrapWith: 'div',
  wrapStyle: {},
  vBundleDidMount: () => {},
};
