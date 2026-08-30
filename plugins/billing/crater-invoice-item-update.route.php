<?php
/**
 * Paste into eliteweblabs/crater → routes/api-custom.php
 * immediately after the POST /api/custom/invoice/{id}/items route.
 *
 * reave.app calls PUT /api/custom/invoice/{invoiceId}/items/{itemId} when the
 * admin agent needs to rename or correct a line-item on an existing invoice
 * (e.g. fixing a typo in the item name without deleting/re-adding the row).
 */

// Update a single line item on an invoice.
// PUT /api/custom/invoice/{invoiceId}/items/{itemId}
Route::put('/custom/invoice/{invoiceId}/items/{itemId}', function (Illuminate\Http\Request $request, $invoiceId, $itemId) {
    if ($request->header('X-Crater-Api-Token') !== env('CRATER_API_TOKEN')) {
        return response()->json(['error' => 'Unauthorized'], 401);
    }

    $invoice = \Crater\Models\Invoice::findOrFail($invoiceId);

    // Verify the item belongs to this invoice.
    $item = $invoice->items()->where('id', $itemId)->firstOrFail();

    $validated = $request->validate([
        'name'        => 'nullable|string|max:255',
        'description' => 'nullable|string',
        'quantity'    => 'nullable|numeric|min:0',
        'price'       => 'nullable|numeric|min:0',  // whole dollars → stored as cents
    ]);

    if (array_key_exists('name', $validated) && $validated['name'] !== null && $validated['name'] !== '') {
        $item->name = $validated['name'];
    }
    if (array_key_exists('description', $validated)) {
        $item->description = $validated['description'];
    }
    if (array_key_exists('quantity', $validated) && $validated['quantity'] !== null) {
        $item->quantity = $validated['quantity'];
    }
    if (array_key_exists('price', $validated) && $validated['price'] !== null) {
        // Crater stores price in cents; the agent sends whole dollars.
        $item->price = (int) round($validated['price'] * 100);
        $item->total = (int) round($validated['price'] * 100 * $item->quantity);
    }

    $item->save();

    // Recalculate invoice totals.
    $invoice->updateTotals();

    return response()->json([
        'success'     => true,
        'item_id'     => $item->id,
        'invoice_id'  => $invoice->id,
        'name'        => $item->name,
        'description' => $item->description,
        'quantity'    => $item->quantity,
        'price'       => $item->price / 100,
        'total'       => $item->total / 100,
    ]);
});
