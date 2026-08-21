type ColorScale = Record<string, string>;

export interface Tokens {
  colors: {
    brand: ColorScale;
    neutral: ColorScale;
    success: ColorScale;
    warning: ColorScale;
    danger: ColorScale;
    info: ColorScale;
  };
  semanticColors: Record<string, string>;
  spacing: Record<string, string>;
  typography: {
    fontFamily: Record<string, string | null>;
    fontSize: Record<string, [string, { lineHeight: string }]>;
    fontWeight: Record<string, string>;
  };
  radius: Record<string, string>;
}

export declare const colors: Tokens['colors'];
export declare const semanticColors: Tokens['semanticColors'];
export declare const spacing: Tokens['spacing'];
export declare const typography: Tokens['typography'];
export declare const radius: Tokens['radius'];
