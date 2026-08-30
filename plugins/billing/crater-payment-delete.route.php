<?php
/**
 * Paste into eliteweblabs/crater → routes/api-custom.php
 * immediately after the PUT /api/custom/payment/{id} route.
 *
 * reave.app calls DELETE /api/custom/payment/{id} when the admin agent needs to
 * remove a duplicate or erroneous payment record entirely.
 */

// Delete a single payment record.
// DELETE /api/custom/payment/{id}
Route::delete('/custom/payment/{id}', function (Illuminate\Http\Request $request, $id) {
    if ($request->header('X-Crater-Api-Token') !== env('CRATER_API_TOKEN')) {
        return response()->json(['error' => 'Unauthorized'], 401);
    }

    $payment = \Crater\Models\Payment::findOrFail($id);

    $paymentNumber = $payment->payment_number;
    $invoiceId     = $payment->invoice_id;
    $amount        = $payment->amount; // cents

    $payment->delete();

    return response()->json([
        'success'        => true,
        'deleted_id'     => (int) $id,
        'payment_number' => $paymentNumber,
        'invoice_id'     => $invoiceId,
        'amount'         => $amount / 100,
        'message'        => "Payment {$paymentNumber} deleted.",
    ]);
});
