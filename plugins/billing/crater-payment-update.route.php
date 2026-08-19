<?php
/**
 * Paste into eliteweblabs/crater → routes/api-custom.php
 * immediately after the POST /api/custom/record-payment route.
 *
 * REΛVE calls PUT /api/custom/payment/{id} when the admin agent needs to
 * update a payment's method, date, notes, or amount (e.g. fix Apple Pay
 * not being recorded correctly on the first try).
 */

// Update a single payment record.
// PUT /api/custom/payment/{id}
Route::put('/custom/payment/{id}', function (Illuminate\Http\Request $request, $id) {
    if ($request->header('X-Crater-Api-Token') !== env('CRATER_API_TOKEN')) {
        return response()->json(['error' => 'Unauthorized'], 401);
    }

    $payment = \Crater\Models\Payment::findOrFail($id);

    $validated = $request->validate([
        'payment_method' => 'nullable|string|max:255',
        'payment_date'   => 'nullable|date',
        'notes'          => 'nullable|string',
        'amount'         => 'nullable|numeric|min:0', // whole dollars → stored as cents
    ]);

    if (array_key_exists('payment_method', $validated) && $validated['payment_method'] !== null) {
        $payment->payment_method = $validated['payment_method'];
    }
    if (array_key_exists('payment_date', $validated) && $validated['payment_date'] !== null) {
        $payment->payment_date = $validated['payment_date'];
    }
    if (array_key_exists('notes', $validated)) {
        $payment->notes = $validated['notes'];
    }
    if (array_key_exists('amount', $validated) && $validated['amount'] !== null) {
        // Crater stores amount in cents; the agent sends whole dollars.
        $payment->amount = (int) round($validated['amount'] * 100);
    }

    $payment->save();

    return response()->json([
        'success'        => true,
        'payment_id'     => $payment->id,
        'payment_number' => $payment->payment_number,
        'payment_method' => $payment->payment_method,
        'payment_date'   => $payment->payment_date,
        'notes'          => $payment->notes,
        'amount'         => $payment->amount / 100,
        'invoice_id'     => $payment->invoice_id,
    ]);
});
