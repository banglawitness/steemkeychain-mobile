import 'react-native-get-random-values';
import {Buffer} from 'buffer';
import process from 'process';

const root = global;

root.Buffer = Buffer;

const previousEnv = root.process && root.process.env ? root.process.env : {};
root.process = process;
root.process.browser = true;
if (typeof root.process.version !== 'string') {
  root.process.version = '';
}
root.process.env = {
  ...process.env,
  ...previousEnv,
};
