import type { APIRoute } from 'astro';

/**
 * Handle incoming Web Share API requests (iOS Share Sheet, Android share)
 * Receives multipart form data with optional image, text, title, url
 * Redirects back to chat with share data in sessionStorage/URL params
 */
export const POST: APIRoute = async ({ request }) => {
  try {
    const formData = await request.formData();
    
    // Extract share data
    const title = formData.get('title') as string;
    const text = formData.get('text') as string;
    const url = formData.get('url') as string;
    const imageFile = formData.get('image') as File;
    
    let imageDataUrl = null;
    
    // Convert image to data URL if present
    if (imageFile && imageFile.size > 0) {
      const buffer = await imageFile.arrayBuffer();
      const base64 = Buffer.from(buffer).toString('base64');
      const mimeType = imageFile.type || 'image/png';
      imageDataUrl = `data:${mimeType};base64,${base64}`;
    }
    
    // Build redirect URL with share data
    const shareData = {
      title,
      text,
      url,
      image: imageDataUrl,
      timestamp: new Date().toISOString(),
    };
    
    // Encode as URL params (image will be large, so we use sessionStorage instead)
    const redirectUrl = new URL('/', request.url);
    redirectUrl.searchParams.set('shareData', JSON.stringify(shareData));
    
    // Return HTML that stores data in sessionStorage and redirects to chat
    return new Response(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>Sharing to Reave...</title>
        <meta name="viewport" content="width=device-width, initial-scale=1">
      </head>
      <body style="background: #000; color: #fff; font-family: system-ui; display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0;">
        <div style="text-align: center;">
          <h2>Opening Reave...</h2>
          <p>Your shared content is being loaded.</p>
        </div>
        <script>
          const shareData = ${JSON.stringify(shareData)};
          sessionStorage.setItem('pendingShare', JSON.stringify(shareData));
          window.location.href = '/';
        </script>
      </body>
      </html>
    `, {
      status: 200,
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
      },
    });
  } catch (error) {
    console.error('Share API error:', error);
    return new Response('Error processing share', { status: 500 });
  }
};
