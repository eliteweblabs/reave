/**
 * Clerk appearance for the admin sign-in bottom sheet.
 * Keep in sync with SignInSheet.astro comments (no nested card chrome).
 */
export function clerkSheetAppearance(allowSignUp) {
  return {
    options: {
      elevation: 'flush',
    },
    elements: {
      rootBox: {
        width: '100%',
        maxWidth: '100%',
      },
      cardBox: {
        width: '100%',
        maxWidth: '100%',
        margin: '0',
        padding: '0',
        boxShadow: 'none',
      },
      card: {
        width: '100%',
        maxWidth: '100%',
        margin: '0',
        padding: '0',
        boxShadow: 'none',
        border: 'none',
        borderRadius: '0',
        background: 'transparent',
      },
      scrollBox: {
        width: '100%',
        maxWidth: '100%',
      },
      main: {
        padding: '0',
      },
      footer: {
        padding: '0',
        background: 'transparent',
        boxShadow: 'none',
      },
      footerAction: allowSignUp
        ? { background: 'transparent' }
        : { display: 'none', background: 'transparent' },
      ...(allowSignUp
        ? {}
        : {
            footerActionLink: { display: 'none' },
            footerActionText: { display: 'none' },
          }),
      header: { display: 'none' },
      headerTitle: { display: 'none' },
      headerSubtitle: { display: 'none' },
    },
  };
}
