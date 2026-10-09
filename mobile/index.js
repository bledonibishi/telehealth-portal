import { registerRootComponent } from 'expo';
import App from './App';

// `pnpm storybook` starts the app as the component library instead (see .rnstorybook/).
const Root = process.env.EXPO_PUBLIC_STORYBOOK_ENABLED === 'true' ? require('./.rnstorybook').default : App;

registerRootComponent(Root);
