<?php
/**
 * Paste into eliteweblabs/crater → routes/api-custom.php
 * (after existing custom routes).
 *
 * reave.app calls POST /api/custom/create-item to add a new entry to the
 * Crater Saved Items catalog (Settings → Items), which can then be quickly
 * added to any invoice or estimate.
 */

use Crater\Models\Company;
use Crater\Models\Item;

Route::post('/custom/create-item', function (Illuminate\Http\Request $request) {
    if ($request->header('X-Crater-Api-Token') !== env('CRATER_API_TOKEN')) {
        return response()->json(['error' => 'Unauthorized'], 401);
    }

    $validated = $request->validate([
        'name'        => 'required|string|max:255',
        'description' => 'nullable|string|max:65535',
        'price'       => 'required|numeric|min:0',
        'unit_name'   => 'nullable|string|max:255',
    ]);

    $company = Company::query()->orderBy('id')->first();
    if (!$company) {
        return response()->json(['error' => 'No company configured in Crater'], 422);
    }

    $companyId = $company->id;

    // Crater stores prices as cents (integer). The reave API passes whole dollars.
    $priceCents = (int) round(floatval($validated['price']) * 100);

    // Check for duplicate name within this company.
    $existing = Item::query()
        ->where('company_id', $companyId)
        ->whereRaw('LOWER(name) = ?', [strtolower(trim($validated['name']))])
        ->first();

    if ($existing) {
        return response()->json([
            'success'     => false,
            'error'       => 'Item with this name already exists',
            'item_id'     => $existing->id,
            'name'        => $existing->name,
            'price_cents' => $existing->price,
            'price'       => round($existing->price / 100, 2),
        ], 409);
    }

    $item = Item::create([
        'name'        => trim($validated['name']),
        'description' => isset($validated['description']) ? trim($validated['description']) : null,
        'price'       => $priceCents,
        'unit_name'   => isset($validated['unit_name']) ? trim($validated['unit_name']) : null,
        'company_id'  => $companyId,
        'creator_id'  => 1,
    ]);

    return response()->json([
        'success'  => true,
        'item_id'  => $item->id,
        'name'     => $item->name,
        'description' => $item->description,
        'price'    => round($item->price / 100, 2),
        'unit_name' => $item->unit_name,
    ]);
});
