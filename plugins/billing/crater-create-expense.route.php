<?php
/**
 * Paste into eliteweblabs/crater → routes/api-custom.php
 *
 * REΛVE calls POST /api/custom/create-expense when a tax receipt email is
 * logged as a Crater expense from the admin dashboard.
 */

use Crater\Models\Company;
use Crater\Models\Expense;
use Crater\Models\ExpenseCategory;
use Crater\Models\CompanySetting;

Route::post('/custom/create-expense', function (Illuminate\Http\Request $request) {
    if ($request->header('X-Crater-Api-Token') !== env('CRATER_API_TOKEN')) {
        return response()->json(['error' => 'Unauthorized'], 401);
    }

    $validated = $request->validate([
        'amount' => 'required|numeric|min:0.01',
        'expense_date' => 'nullable|date',
        'category_name' => 'nullable|string|max:120',
        'notes' => 'nullable|string|max:65000',
    ]);

    $company = Company::query()->orderBy('id')->first();
    if (!$company) {
        return response()->json(['error' => 'No company configured in Crater'], 422);
    }

    $companyId = $company->id;
    $currencyId = CompanySetting::getSetting('currency', $companyId);
    if (!$currencyId) {
        return response()->json(['error' => 'Company currency is not configured'], 422);
    }

    $categoryName = trim((string) ($validated['category_name'] ?? 'Business Expense'));
    if ($categoryName === '') {
        $categoryName = 'Business Expense';
    }

    $category = ExpenseCategory::query()
        ->where('company_id', $companyId)
        ->whereRaw('LOWER(name) = ?', [strtolower($categoryName)])
        ->first();

    if (!$category) {
        $category = ExpenseCategory::create([
            'name' => $categoryName,
            'company_id' => $companyId,
        ]);
    }

    $amountDollars = (float) $validated['amount'];
    $amountCents = (int) round($amountDollars * 100);
    $expenseDate = $validated['expense_date'] ?? now()->format('Y-m-d');

    $expense = Expense::create([
        'expense_date' => $expenseDate,
        'amount' => $amountCents,
        'base_amount' => $amountCents,
        'expense_category_id' => $category->id,
        'company_id' => $companyId,
        'currency_id' => $currencyId,
        'notes' => $validated['notes'] ?? null,
        'creator_id' => 1,
        'exchange_rate' => 1,
    ]);

    $adminUrl = url('/admin/expenses/' . $expense->id . '/edit');

    return response()->json([
        'success' => true,
        'expense_id' => $expense->id,
        'amount' => $amountDollars,
        'expense_date' => $expenseDate,
        'category' => $category->name,
        'admin_url' => $adminUrl,
    ]);
});
