// Copyright (c) 2026 MikeRust contributors. Licensed under AGPL-3.0-only.

import { mount } from 'svelte'
import App from './App.svelte'
import './app.css'

const target = document.getElementById('app')
if (!target) throw new Error('Root #app element missing from index.html')

export const app = mount(App, { target })
