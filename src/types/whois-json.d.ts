declare module 'whois-json' {
  export default function whois(domain: string): Promise<Record<string, unknown>>;
}
