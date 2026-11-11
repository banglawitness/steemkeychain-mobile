import 'react-native-gesture-handler';
import './src/shims/installPolyfills';
import {registerRootComponent} from 'expo';
import App from './App';

registerRootComponent(App);
