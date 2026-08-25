<?php
/**
 * Paste into eliteweblabs/crater → routes/api-custom.php
 * immediately after the GET /api/custom/customers route.
 *
 * reΛVe.app calls PUT /api/custom/customer/{id} when a contact's company, name,
 * email, or phone is edited in the admin clients panel.
 */

// Update customer profile (sync from reΛVe.app contact edits).
// PUT /api/custom/customer/{id}
Route::put('/custom/customer/{id}', function (Illuminate\Http\Request $request, $id) {
    if ($request->header('X-Crater-Api-Token') !== env('CRATER_API_TOKEN')) {
        return response()->json(['error' => 'Unauthorized'], 401);
    }

    $customer = Customer::findOrFail($id);

    $validated = $request->validate([
        'name' => 'nullable|string',
        'contact_name' => 'nullable|string',
        'email' => 'nullable|string',
        'phone' => 'nullable|string',
    ]);

    if (array_key_exists('name', $validated) && $validated['name'] !== null && $validated['name'] !== '') {
        $customer->name = $validated['name'];
    }
    if (array_key_exists('contact_name', $validated)) {
        $customer->contact_name = $validated['contact_name'] ?: $customer->name;
    }
    if (array_key_exists('email', $validated)) {
        $customer->email = $validated['email'] ?: null;
    }
    if (array_key_exists('phone', $validated)) {
        $customer->phone = $validated['phone'] ?: null;
    }
    $customer->save();

    return response()->json([
        'success' => true,
        'customer_id' => $customer->id,
        'name' => $customer->name,
        'contact_name' => $customer->contact_name,
        'email' => $customer->email,
        'phone' => $customer->phone,
    ]);
});
