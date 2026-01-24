from playwright.sync_api import Page, expect, sync_playwright

def verify_chord_display(page: Page):
    # 1. Open the application
    page.goto("http://localhost:8000/public/index.html")

    # 2. Open the Arrangement Editor
    editor_btn = page.locator("#editArrangementBtn")
    expect(editor_btn).to_be_visible()
    editor_btn.click()

    # 3. Wait for the section list to appear
    page.wait_for_selector("#sectionList")

    # 4. Find the first section's input (it should exist by default)
    # The default section usually has "I" or something similar.
    # We will locate the textarea.
    textarea = page.locator("#sectionList textarea.section-prog-input").first
    expect(textarea).to_be_visible()

    # 5. Type "im9" and trigger change
    textarea.fill("im9")
    # Trigger change event to update the state
    textarea.evaluate("e => e.blur()")

    # 6. Close the editor
    close_btn = page.locator("#closeEditorBtn")
    close_btn.click()

    # 7. Wait for the chord visualizer to update
    # The visualizer is #chordVisualizer.
    # It contains .measure-box -> .chord-card
    visualizer = page.locator("#chordVisualizer")
    expect(visualizer).to_be_visible()

    # Find the chord card
    card = visualizer.locator(".chord-card").first
    expect(card).to_be_visible()

    # 8. Assert the text content
    # We expect root "i" and suffix "9".
    root = card.locator(".root")
    suffix = card.locator(".suffix")

    expect(root).to_have_text("i")
    expect(suffix).to_have_text("9")

    # 9. Take screenshot
    page.screenshot(path="verification_im9.png")

if __name__ == "__main__":
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()
        try:
            verify_chord_display(page)
            print("Verification Successful!")
        except Exception as e:
            print(f"Verification Failed: {e}")
            page.screenshot(path="verification_failed.png")
            raise e
        finally:
            browser.close()
