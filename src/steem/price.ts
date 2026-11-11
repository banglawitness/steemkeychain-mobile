export type Prices = {
  steemUsd?: number;
  sbdUsd?: number;
  steemChange?: number;
  sbdChange?: number;
};

export async function loadPrices(): Promise<Prices> {
  const market = await fetch(
    'https://api.coingecko.com/api/v3/simple/price?ids=steem,steem-dollars&vs_currencies=usd&include_24hr_change=true',
  )
    .then(response => response.json())
    .catch(() => null);
  const steemUsd = Number(market?.steem?.usd);
  const sbdUsd = Number(market?.['steem-dollars']?.usd);
  const steemChange = Number(market?.steem?.usd_24h_change);
  const sbdChange = Number(market?.['steem-dollars']?.usd_24h_change);
  return {
    steemUsd: Number.isFinite(steemUsd) ? steemUsd : undefined,
    sbdUsd: Number.isFinite(sbdUsd) ? sbdUsd : undefined,
    steemChange: Number.isFinite(steemChange) ? steemChange : undefined,
    sbdChange: Number.isFinite(sbdChange) ? sbdChange : undefined,
  };
}

export function money(value?: number): string {
  if (value === undefined) return '';
  return `$${value.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 4})}`;
}
