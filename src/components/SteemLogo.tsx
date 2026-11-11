import Svg, {Circle, Path, Text as SvgText} from 'react-native-svg';

export default function SteemLogo({size = 32}: {size?: number}) {
  return (
    <Svg width={size} height={size} viewBox="0 0 32 32">
      <Circle cx="16" cy="16" r="16" fill="#4BA2F2" />
      <Path
        fill="#FFFFFF"
        d="M9.87 8.229c.216.037-.322 1.47-.022 3.107.26 1.403 3.507 6.836 3.373 8.7-.104 1.17-2.77 3.915-3.051 3.732-.307-.085.81-1.95.396-3.504-.482-1.812-3.34-6.496-3.337-8.564 0-1.513 2.448-3.569 2.64-3.471zm6.109-2.14c.274.047-.41 1.876-.028 3.959.33 1.792 4.473 8.72 4.301 11.095-.134 1.494-3.532 4.991-3.892 4.76-.39-.107 1.034-2.486.506-4.468-.613-2.308-4.258-8.282-4.255-10.919 0-1.931 3.122-4.55 3.368-4.426zm6.305 2.14c.216.037-.321 1.47-.022 3.107.26 1.403 3.507 6.836 3.374 8.7-.103 1.17-2.77 3.915-3.052 3.732-.306-.085.81-1.95.396-3.504-.481-1.812-3.34-6.496-3.337-8.564 0-1.513 2.45-3.569 2.641-3.471z"
      />
    </Svg>
  );
}

export function SbdLogo({size = 32}: {size?: number}) {
  return (
    <Svg width={size} height={size} viewBox="0 0 32 32">
      <Circle cx="16" cy="16" r="16" fill="#1FA971" />
      <SvgText
        x="16"
        y="21.5"
        fill="#FFFFFF"
        fontSize="16"
        fontWeight="800"
        textAnchor="middle">
        $
      </SvgText>
    </Svg>
  );
}

export function SpLogo({size = 32}: {size?: number}) {
  return (
    <Svg width={size} height={size} viewBox="0 0 32 32">
      <Circle cx="16" cy="16" r="16" fill="#2457C5" />
      <Path fill="#FFFFFF" d="M18.2 5.5 11.2 17.4h4.8L13.8 26.5 22.2 14.2h-4.9z" />
    </Svg>
  );
}
