/** Mock violations — empty by default; demo address has one open item. */
export const mockViolationsProvider = {
    id: 'mock',
    configured: () => true,
    async lookup(input) {
        const key = input.address.toLowerCase();
        if (key.includes('123 main')) {
            return {
                ok: true,
                source: 'mock_municipal',
                violations: [
                    {
                        id: 'mock-viol-1',
                        category: 'housing',
                        description: 'Open housing code inspection — smoke detector compliance',
                        status: 'open',
                        issuedAt: '2025-11-02',
                        source: 'mock_municipal',
                    },
                ],
            };
        }
        return { ok: true, source: 'mock_municipal', violations: [] };
    },
};
export async function lookupViolations(input) {
    return mockViolationsProvider.lookup(input);
}
//# sourceMappingURL=index.js.map