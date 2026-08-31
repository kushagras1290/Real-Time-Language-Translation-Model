import { useState } from 'react'
import TranslationApp from './components/TranslationApp'

import './App.css'

function App() {
  const [count, setCount] = useState(0)

  return (
    <>
    <TranslationApp/>

    </>
  )
}

export default App
